import { Router }          from "express";
import { getAnalysisReport } from "../controllers/analytics.controller";
import verifyToken         from "../middleware/auth.middleware";
import { generalLimiter }  from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(
  "/get_analytics",
  generalLimiter,
  verifyToken,
  getAnalysisReport
);

export default router;