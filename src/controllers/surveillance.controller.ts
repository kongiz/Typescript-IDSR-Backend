import { Request, Response }           from "express";
import db                              from "../config/db";
import logger                          from "../config/logger";
import { getEpiWeek }                  from "../utils/epiWeek.utils";
import { surveillanceReportSchema }    from "../schemas/surveillanceReport.schema";
import { notifyUser, notifyByRole }    from "../services/notificationFirebase.service";
import { audit }                       from "../services/audit.service";
import { JwtDecoded }                  from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

const ALLOWED_ROLES: Role[] = ["Health Officer", "Clinician", "Community Health Worker"];


export const submitSurveillanceReport = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      res.status(403).json({
        success: false,
        message: "You are not allowed to submit surveillance reports",
      });
      return;
    }


    // Zod schema validation
    const parsed = surveillanceReportSchema.safeParse(
      Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ])
      )
    );

    if (!parsed.success) {
      logger.warn("Surveillance validation failed", { errors: parsed.error.flatten().fieldErrors });
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const data = parsed.data;

    data.region_id   = data.region_id   ?? data.regionId;
    data.district_id = data.district_id ?? data.districtId;
    data.facility_id = data.facility_id ?? data.facilityId;

   // Check if the user is submitting within their assigned region and district

    if (
      user.region_id   !== data.region_id ||
      user.district_id !== data.district_id
    ) {
      res.status(403).json({
        success: false,
        message: "You cannot submit outside your assigned district",
      });
      return;
    }

    const epiweek = data.epiweek ?? String(getEpiWeek(new Date()));

    await client.query("BEGIN");

    const districtCheck = await client.query(
      `SELECT 1 FROM health_district WHERE district_id = $1 AND region_id = $2`,
      [data.district_id, data.region_id]
    );
    if (districtCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ success: false, message: "Invalid district for selected region" });
      return;
    }

    const facilityCheck = await client.query(
      `SELECT 1 FROM health_facilities WHERE facility_id = $1 AND district_id = $2`,
      [data.facility_id, data.district_id]
    );
    if (facilityCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ success: false, message: "Invalid facility for selected district" });
      return;
    }

    const duplicate = await client.query(
      `SELECT 1 FROM surveillance_reports
       WHERE user_id = $1 AND facility_id = $2 AND epiweek = $3 AND date_from = $4`,
      [user.id, data.facility_id, epiweek, data.dateFrom]
    );
    if (duplicate.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        message: "A surveillance report for this facility, epiweek, and date range already exists",
      });
      return;
    }

    const reportResult = await client.query<{ id: number }>(
      `INSERT INTO surveillance_reports (
        user_id, region_id, district_id, facility_id,
        epiweek, date_from, date_to, facility_geo,
        tot_con_u5_male, tot_con_u5_female,
        tot_con_a5_male, tot_con_a5_female,
        officer_comment, officer_name, designation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`,
      [
        user.id,
        data.region_id,
        data.district_id,
        data.facility_id,
        epiweek,
        data.dateFrom,
        data.dateTo,
        data.facilityGeo    ?? null,
        data.totConU5Male,
        data.totConU5Female,
        data.totConA5Male,
        data.totConA5Female,
        data.officerComment,
        data.officerName,
        data.designation,
      ]
    );

    const reportId = reportResult.rows[0].id;

    await Promise.all(
      data.updatedDiseases.map(dis =>
        client.query(
          `INSERT INTO surveillance_diseases (
            report_id, disease_name,
            u5_male_alive, u5_female_alive,
            a5_male_alive, a5_female_alive,
            u5_male_dead,  u5_female_dead,
            a5_male_dead,  a5_female_dead,
            total_sample_collected
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            reportId,
            dis.name,
            dis.u5MaleAlive,
            dis.u5FemaleAlive,
            dis.a5MaleAlive,
            dis.a5FemaleAlive,
            dis.u5MaleDeath,
            dis.u5FemaleDeath,
            dis.a5MaleDeath,
            dis.a5FemaleDeath,
            dis.totalSamples,
          ]
        )
      )
    );

    await client.query("COMMIT");

    await Promise.all([
      audit({
        userId:     user.id,
        action:     "CREATE",
        resource:   "SURVEILLANCE_REPORT",
        resourceId: reportId,
        ipAddress:  req.ip,
        userAgent:  req.headers["user-agent"] as string,
        metadata:   {
          epiweek,
          facility_id:   data.facility_id,
          district_id:   data.district_id,
          region_id:     data.region_id,
          disease_count: data.updatedDiseases.length,
        },
      }),
      notifyUser({
        user_id:        user.id,
        title:          "Surveillance Report Submitted",
        body:           "Your weekly surveillance report has been submitted successfully.",
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "SURVEILLANCE",
      }),
      notifyByRole({
        roles:          ["District Officer", "Regional Officer", "Admin"],
        title:          "New Surveillance Report",
        body:           "A new weekly surveillance report has been submitted.",
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "SURVEILLANCE",
      }),
    ]);

    res.status(201).json({
      success: true,
      message: "Surveillance report submitted successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("submitSurveillanceReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};