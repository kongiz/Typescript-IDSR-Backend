import { Request, Response }        from "express";
import db                           from "../config/db";
import logger                       from "../config/logger";
import { labReportSchema }          from "../schemas/labReport.schema";
import { notifyUser, notifyByRole } from "../services/notificationFirebase.service";
import { audit }                    from "../services/audit.service";

export const createLabReport = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const user  = req.user;
    const files = req.files as Express.Multer.File[];

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (user.role === "Admin") {
      res.status(403).json({ success: false, message: "Admin cannot submit lab reports" });
      return;
    }

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: "At least one lab result image is required" });
      return;
    }

    const parsed = labReportSchema.safeParse(
      Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ])
      )
    );

    if (!parsed.success) {
      logger.warn("Lab report validation failed", { errors: parsed.error.flatten().fieldErrors });
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
      `SELECT 1 FROM laboratory_reports
       WHERE user_id           = $1
         AND lab_name          = $2
         AND date_lab_received = $3
         AND final_lab_result  = $4`,
      [user.id, data.labName, data.dateLabReceived, data.finalLabResult]
    );

    if (duplicate.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        message: "A lab report with the same lab name, received date, and result already exists",
      });
      return;
    }

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO laboratory_reports (
        user_id, region_id, district_id,
        lab_name, date_lab_received, specimen_condition,
        test_types_performed, final_lab_result,
        date_lab_sent_district, date_district_received_lab_result,
        lab_result_images
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id`,
      [
        user.id,
        user.region_id   ?? null,
        user.district_id ?? null,
        data.labName,
        data.dateLabReceived,
        data.specimenCondition,
        data.testTypesPerformed,
        data.finalLabResult,
        data.dateLabSentDistrict,
        data.dateDistrictReceivedLabResult,
        files.map(f => f.path.replace(/\\/g, "/")),
      ]
    );

    const reportId = insertResult.rows[0].id;

    await client.query("COMMIT");


    await Promise.all([
      audit({
        userId:     user.id,
        action:     "CREATE",
        resource:   "LAB_REPORT",
        resourceId: reportId,
        ipAddress:  req.ip,
        userAgent:  req.headers["user-agent"] as string,
        metadata:   {
          lab_name:         data.labName,
          final_lab_result: data.finalLabResult,
          image_count:      files.length,
        },
      }),
      notifyUser({
        user_id:        user.id,
        title:          "Lab Report Submitted",
        body:           `Your lab report from ${data.labName} has been submitted successfully.`,
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "LAB",
      }),
      notifyByRole({
        roles:          ["District Officer", "Regional Officer", "Admin"],
        title:          "New Lab Report",
        body:           `A new lab report from ${data.labName} has been submitted. Result: ${data.finalLabResult}.`,
        type:           "REPORT_SUBMITTED",
        reference_id:   reportId,
        reference_type: "LAB",
      }),
    ]);

    res.status(201).json({
      success: true,
      message: "Laboratory report saved successfully",
      data:    { id: reportId },
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("createLabReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    client.release();
  }
};