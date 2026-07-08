import { Router }                from "express";
import { submitImmediateReport } from "../controllers/annex2FImmediateReport.controller";
import { getImmediateReports }   from "../controllers/get_annex2FImmediate.controller";
import { editImmediateReport }   from "../controllers/edit_annex2FImmediate.controller";
import verifyToken               from "../middleware/auth.middleware";
import { generalLimiter, reportSubmitLimiter } from "../middleware/rateLimiter.middleware";
import { blockRole }             from "../middleware/roleGuard.middleware";

const router = Router();

router.post(
  "/submit_annex2FImmediateReport",
  reportSubmitLimiter,
  verifyToken,
  blockRole("Admin"),
  submitImmediateReport
);

router.get(
  "/get_annex2FImmediateReports",
  generalLimiter,
  verifyToken,
  getImmediateReports
);

router.put(
  "/edit_annex2FImmediateReport/:id",
  generalLimiter,
  verifyToken,
  editImmediateReport
);

export default router;