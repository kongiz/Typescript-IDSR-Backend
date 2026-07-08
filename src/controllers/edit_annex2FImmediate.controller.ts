import { Request, Response }      from "express";
import db                         from "../config/db";
import logger                     from "../config/logger";
import { immediateReportSchema }  from "../schemas/immediateReport.schema";


interface ExistingImmediateReportRow {
  id:         number;
  user_id:    number;
  created_at: Date;
  [key: string]: unknown;
}

export const editImmediateReport = async (req: Request, res: Response): Promise<void> => {
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


    const existing = await client.query<ExistingImmediateReportRow>(
      `SELECT * FROM annex2f_immediate_case_reports WHERE id = $1`,
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
    const parsed = immediateReportSchema.safeParse(
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
      `UPDATE annex2f_immediate_case_reports SET
        reporting_site_name    = $1,
        disease                = $2,
        patient_type           = $3,
        date_seen              = $4,
        patient_name           = $5,
        date_of_birth          = $6,
        age                    = $7,
        gender                 = $8,
        address                = $9,
        area                   = $10,
        phone_number           = $11,
        occupation             = $12,
        date_of_onset          = $13,
        travel_history         = $14,
        destination            = $15,
        vaccine_doses          = $16,
        date_last_vaccine      = $17,
        date_specimen          = $18,
        date_lab               = $19,
        lab_results            = $20,
        outcome                = $21,
        classification         = $22,
        date_facility_notified = $23,
        date_sent_district     = $24,
        reporter_name          = $25,
        updated_at             = NOW()
       WHERE id = $26`,
      [
        data.site                ?? null,
        data.disease,
        data.inpatientOutpatient ?? null,
        data.dateSeen,
        data.patientName         ?? null,
        data.dateOfBirth         ?? null,
        data.age                 ?? null,
        data.gender              ?? null,
        data.address             ?? null,
        data.urbanRural          ?? null,
        data.phoneNumber         ?? null,
        data.occupation          ?? null,
        data.dateOfOnset         ?? null,
        data.travelHistory       ?? null,
        data.destination         ?? null,
        data.vaccineDoses        ?? null,
        data.dateLastVaccine     ?? null,
        data.dateSpecimen        ?? null,
        data.dateLab             ?? null,
        data.labResults          ?? null,
        data.outcome             ?? null,
        data.classification      ?? null,
        data.dateFacilityNotified,
        data.dateSentDistrict    ?? null,
        data.reporterName,
        reportId,
      ]
    );

    // Edit log

    await client.query(
      `INSERT INTO report_edit_logs (report_id, report_type, edited_by, previous_data, new_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        reportId,
        "ANNEX2F IMMEDIATE CASE REPORT",
        user.id,
        JSON.stringify(report),
        JSON.stringify(data),
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Immediate report updated successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("editImmediateReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};