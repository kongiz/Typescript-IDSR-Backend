import { Request, Response }           from "express";
import db                              from "../config/db";
import logger                          from "../config/logger";
import { specimenReportSchema }        from "../schemas/specimenReport.schema";
import { audit }                       from "../services/audit.service";
import { notifyUser, notifyByRole }    from "../services/notificationFirebase.service";


export const submitSpecimenReport = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (user.role === "Admin") {
      res.status(403).json({ success: false, message: "Admin cannot submit specimen reports" });
      return;
    }

    // Validate request body against schema and trim string fields
    const parsed = specimenReportSchema.safeParse(
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

    await client.query("BEGIN");


    const duplicate = await client.query(
      `SELECT 1 FROM laboratory_report_form_with_specimen
       WHERE user_id               = $1
         AND suspected_disease     = $2
         AND date_specimen_collect = $3
         AND specimen_unique_id    = $4`,
      [user.id, data.suspectedDisease, data.dateSpecimenCollect, data.specimenUniqueID ?? null]
    );

    if (duplicate.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        message: "A specimen report with the same disease, collection date, and specimen ID already exists",
      });
      return;
    }

    // Insert the new specimen report into the database

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO laboratory_report_form_with_specimen (
        user_id, region_id, district_id,
        date_specimen_collect, suspected_disease, specimen_type,
        specimen_unique_id, patient_name, gender, age,
        date_specimen_sent_lab, phone_number, email_clinician
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
      [
        user.id,
        user.region_id             ?? null,
        user.district_id           ?? null,
        data.dateSpecimenCollect,
        data.suspectedDisease,
        data.specimenType,
        data.specimenUniqueID      ?? null,
        data.patientNameLab        ?? null,
        data.sex                   ?? null,
        data.age,
        data.dateSpecimenSentLab   ?? null,
        data.phoneNumber           ?? null,
        data.emailClinician        ?? null,
      ]
    );

    const reportId = insertResult.rows[0].id;

    await client.query("COMMIT");


    await Promise.all([
      audit({
        userId:     user.id,
        action:     "CREATE",
        resource:   "SPECIMEN_REPORT",
        resourceId: reportId,
        ipAddress:  req.ip,
        userAgent:  req.headers["user-agent"] as string,
        metadata:   {
          suspected_disease:     data.suspectedDisease,
          date_specimen_collect: data.dateSpecimenCollect,
          specimen_unique_id:    data.specimenUniqueID ?? null,
        },
      }),
      notifyUser({
        user_id:        user.id,
        title:          "Specimen Report Submitted",
        body:           `Your specimen report for ${data.suspectedDisease} has been submitted successfully.`,
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "SPECIMEN",
      }),
      notifyByRole({
        roles:          ["District Officer", "Regional Officer", "Admin"],
        title:          "New Specimen Report",
        body:           `A new specimen report for ${data.suspectedDisease} has been submitted.`,
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "SPECIMEN",
      }),
    ]);

    res.status(201).json({
      success: true,
      message: "Specimen report submitted successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("submitSpecimenReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};