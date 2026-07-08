import { Router } from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
} from "../controllers/profile.controller";
import verifyToken        from "../middleware/auth.middleware";
import { generalLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(   "/",                generalLimiter, verifyToken, getProfile);
router.patch( "/update",          generalLimiter, verifyToken, updateProfile);
router.patch( "/change-password", generalLimiter, verifyToken, changePassword);

export default router;