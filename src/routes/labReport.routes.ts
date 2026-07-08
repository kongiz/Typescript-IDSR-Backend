import { Router, Request, Response, NextFunction } from "express";
import multer              from "multer";
import verifyToken         from "../middleware/auth.middleware";
import upload              from "../middleware/upload.middleware";
import { createLabReport } from "../controllers/labReport.controller";
import { getLabReports }   from "../controllers/get_labReport.controller";
import { editLabReport }   from "../controllers/edit_labReport.controller";
import { generalLimiter, reportSubmitLimiter } from "../middleware/rateLimiter.middleware";
import { requireRole }     from "../middleware/roleGuard.middleware";


const router = Router();

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  upload.array("labResultImage", 10)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({
        success: false,
        message: err.code === "LIMIT_FILE_SIZE"
          ? "File too large. Maximum size is 5MB"
          : "File upload error",
      });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    next();
  });
}


router.post(
  "/submit_lab_report",
  reportSubmitLimiter,
  verifyToken,
  requireRole("Lab Technician", "Health Officer", "Clinician"),
  handleUpload,
  createLabReport
);

router.get(
  "/get_labReports",
  generalLimiter,
  verifyToken,
  getLabReports
);

router.put(
  "/edit_lab_report/:id",
  generalLimiter,
  verifyToken,
  requireRole("Lab Technician", "Admin"),
  handleUpload,
  editLabReport
);

export default router;