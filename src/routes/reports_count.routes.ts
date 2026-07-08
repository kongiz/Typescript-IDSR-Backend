import { Router }        from "express";
import { countReports }  from "../controllers/reportCount.controller";
import verifyToken       from "../middleware/auth.middleware";
import { pollingLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

router.get("/get_reports_count", verifyToken, pollingLimiter, countReports);

export default router;