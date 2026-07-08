import { Router }       from "express";
import { selfRegister } from "../controllers/signup.controller";
import { authLimiter }  from "../middleware/rateLimiter.middleware";

const router = Router();

router.post("/signup", authLimiter, selfRegister);

export default router;