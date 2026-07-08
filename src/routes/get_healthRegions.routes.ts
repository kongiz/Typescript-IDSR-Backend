import { Router }           from "express";
import { getHealthRegions }  from "../controllers/get_healthRegions.controller";
import { generalLimiter }   from "../middleware/rateLimiter.middleware";

const router = Router();

router.get("/get_healthRegions", generalLimiter, getHealthRegions);

export default router;