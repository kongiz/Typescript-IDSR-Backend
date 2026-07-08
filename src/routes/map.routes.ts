import { Router }        from "express";
import { getMapPoints }  from "../controllers/map.controller";
import verifyToken       from "../middleware/auth.middleware";
import { generalLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

router.get("/get_map", generalLimiter, verifyToken, getMapPoints);

export default router;