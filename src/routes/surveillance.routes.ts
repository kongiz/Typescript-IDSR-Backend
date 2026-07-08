import { Router }                   from "express";
import { submitSurveillanceReport } from "../controllers/surveillance.controller";
import { getSurveillanceReports }   from "../controllers/get_surveillance.controller";
import { editSurveillanceReport }   from "../controllers/edit_surveillance.controller";
import verifyToken                  from "../middleware/auth.middleware";
import { generalLimiter, reportSubmitLimiter } from "../middleware/rateLimiter.middleware";
import { requireRole }              from "../middleware/roleGuard.middleware";

const router = Router();

router.post(
  "/submit_surveillance_report",
  reportSubmitLimiter,
  verifyToken,
  requireRole("Health Officer", "Clinician", "Community Health Worker"),
  submitSurveillanceReport
);

router.get(
  "/get_surveillance_reports",
  generalLimiter,
  verifyToken,
  getSurveillanceReports
);

router.put(
  "/edit_surveillance_report/:id",
  generalLimiter,
  verifyToken,
  editSurveillanceReport
);

export default router;