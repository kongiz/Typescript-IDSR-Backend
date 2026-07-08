import { Router }             from "express";
import { getHealthFacilities } from "../controllers/get_healthFacilities.controller";
import { generalLimiter }     from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(
  "/get_healthFacilities",
  generalLimiter,
  getHealthFacilities
);

export default router;