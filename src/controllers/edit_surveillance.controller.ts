import { Request, Response }        from "express";
import db                           from "../config/db";
import logger                       from "../config/logger";
import { surveillanceReportSchema } from "../schemas/surveillanceReport.schema";

interface ExistingReportRow {
  id:         number;
  user_id:    number;
  created_at: Date;
  [key: string]: unknown;
}

export const editSurveillanceReport = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const user     = req.user;
    const reportId = parseInt(req.params.id as string);

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (isNaN(reportId)) {
      res.status(400).json({ success: false, message: "Invalid report ID" });
      return;
    }


    const existing = await client.query<ExistingReportRow>(
      `SELECT * FROM surveillance_reports WHERE id = $1`,
      [reportId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    const report = existing.rows[0];

    // Check if the user is allowed to edit this report

    if (report.user_id !== user.id && user.role !== "Admin") {
      res.status(403).json({ success: false, message: "You are not allowed to edit this report" });
      return;
    }

    // Check if the report is within the 48-hour edit window for non-admin users

    if (user.role !== "Admin") {
      const hoursDiff = (Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursDiff > 48) {
        res.status(403).json({
          success: false,
          message: "This report can no longer be edited. The 48-hour edit window has passed.",
        });
        return;
      }
    }

    const parsed = surveillanceReportSchema.safeParse(
      Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ])
      )
    );

    if (!parsed.success) {
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

    await client.query("BEGIN");

    const previousDiseases = await client.query(
      `SELECT * FROM surveillance_diseases WHERE report_id = $1`,
      [reportId]
    );

    await client.query(
      `UPDATE surveillance_reports SET
        region_id         = $1,
        district_id       = $2,
        facility_id       = $3,
        date_from         = $4,
        date_to           = $5,
        facility_geo      = $6,
        tot_con_u5_male   = $7,
        tot_con_u5_female = $8,
        tot_con_a5_male   = $9,
        tot_con_a5_female = $10,
        officer_comment   = $11,
        officer_name      = $12,
        designation       = $13,
        updated_at        = NOW()
       WHERE id = $14`,
      [
        data.region_id,
        data.district_id,
        data.facility_id,
        data.dateFrom,
        data.dateTo,
        data.facilityGeo  ?? null,
        data.totConU5Male,
        data.totConU5Female,
        data.totConA5Male,
        data.totConA5Female,
        data.officerComment,
        data.officerName,
        data.designation,
        reportId,
      ]
    );

    await client.query(
      `DELETE FROM surveillance_diseases WHERE report_id = $1`,
      [reportId]
    );

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


    await client.query(
      `INSERT INTO report_edit_logs (report_id, report_type, edited_by, previous_data, new_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        reportId,
        "SURVEILLANCE REPORT",
        user.id,
        JSON.stringify({ ...report, diseases: previousDiseases.rows }),
        JSON.stringify(data),
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Surveillance report updated successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("editSurveillanceReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};