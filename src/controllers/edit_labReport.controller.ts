import { Request, Response } from "express";
import db                    from "../config/db";
import logger                from "../config/logger";
import { labReportSchema }   from "../schemas/labReport.schema";


interface ExistingLabReportRow {
  id:               number;
  user_id:          number;
  created_at:       Date;
  lab_result_image: string | null;
  [key: string]:    unknown;
}


export const editLabReport = async (req: Request, res: Response): Promise<void> => {
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


    const existing = await client.query<ExistingLabReportRow>(
      `SELECT * FROM laboratory_reports WHERE id = $1`,
      [reportId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    const report = existing.rows[0];

    //  Check if the user is allowed to edit this report

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

    
    // Validate the request body using Zod schema
    const parsed = labReportSchema.safeParse(
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

    // Retrieve the uploaded file (if any) and determine the image path

    const files     = req.files as Express.Multer.File[] | undefined;
    const imagePath = files && files.length > 0
      ? files[0].path.replace(/\\/g, "/")
      : report.lab_result_image;

    // Update the laboratory report in the database
    await client.query(
      `UPDATE laboratory_reports SET
        lab_name                          = $1,
        date_lab_received                 = $2,
        specimen_condition                = $3,
        test_types_performed              = $4,
        final_lab_result                  = $5,
        date_lab_sent_district            = $6,
        date_district_received_lab_result = $7,
        lab_result_image                  = $8,
        updated_at                        = NOW()
       WHERE id = $9`,
      [
        data.labName,
        data.dateLabReceived,
        data.specimenCondition,
        data.testTypesPerformed,
        data.finalLabResult,
        data.dateLabSentDistrict,
        data.dateDistrictReceivedLabResult,
        imagePath,
        reportId,
      ]
    );

    // Log the edit action in the report_edit_logs table

    await client.query(
      `INSERT INTO report_edit_logs (report_id, report_type, edited_by, previous_data, new_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportId, "LAB REPORT", user.id, JSON.stringify(report), JSON.stringify(data)]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Lab report updated successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("editLabReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};