import { Request, Response }     from "express";
import db                        from "../config/db";
import logger                    from "../config/logger";
import { specimenReportSchema }  from "../schemas/specimenReport.schema";



interface ExistingSpecimenReportRow {
  id:         number;
  user_id:    number;
  created_at: Date;
  [key: string]: unknown;
}


export const editSpecimenReport = async (req: Request, res: Response): Promise<void> => {
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

    const existing = await client.query<ExistingSpecimenReportRow>(
      `SELECT * FROM laboratory_report_form_with_specimen WHERE id = $1`,
      [reportId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    const report = existing.rows[0];

    // Ownership check: Only the user who submitted the report or an Admin can edit it

    if (report.user_id !== user.id && user.role !== "Admin") {
      res.status(403).json({ success: false, message: "You are not allowed to edit this report" });
      return;
    }

    // 48-hour window check

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

    // Update the report in the database

    await client.query(
      `UPDATE laboratory_report_form_with_specimen SET
        date_specimen_collect  = $1,
        suspected_disease      = $2,
        specimen_type          = $3,
        specimen_unique_id     = $4,
        patient_name           = $5,
        gender                 = $6,
        age                    = $7,
        date_specimen_sent_lab = $8,
        phone_number           = $9,
        email_clinician        = $10,
        updated_at             = NOW()
       WHERE id = $11`,
      [
        data.dateSpecimenCollect,
        data.suspectedDisease,
        data.specimenType,
        data.specimenUniqueID    ?? null,
        data.patientNameLab      ?? null,
        data.sex                 ?? null,
        data.age,
        data.dateSpecimenSentLab ?? null,
        data.phoneNumber         ?? null,
        data.emailClinician      ?? null,
        reportId,
      ]
    );

    // Edit log

    await client.query(
      `INSERT INTO report_edit_logs (report_id, report_type, edited_by, previous_data, new_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        reportId,
        "ANNEX2G SPECIMEN REPORT",
        user.id,
        JSON.stringify(report),
        JSON.stringify(data),
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Specimen report updated successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("editSpecimenReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};