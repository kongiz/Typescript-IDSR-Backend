import { Router } from "express";
import {
  resendVerificationOtp,
  forgotPassword,
  verifyEmail,
  verifyResetOtp,
  resetPassword,
} from "../controllers/auth.contoller";
import { otpLimiter, otpVerifyLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

router.post("/resend-otp",       otpLimiter,       resendVerificationOtp);
router.post("/forgot-password",  otpLimiter,       forgotPassword);
router.post("/verify-email",     otpVerifyLimiter, verifyEmail);
router.post("/verify-reset-otp", otpVerifyLimiter, verifyResetOtp);
router.post("/reset-password",   otpVerifyLimiter, resetPassword);

export default router;