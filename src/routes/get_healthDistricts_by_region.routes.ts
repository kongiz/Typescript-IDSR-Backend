import { Router }            from "express";
import { getHealthDistricts } from "../controllers/get_healthDistricts_by_region.controller";
import { generalLimiter }    from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(
  "/get_healthDistricts_by_region",
  generalLimiter,
  getHealthDistricts
);

export default router;