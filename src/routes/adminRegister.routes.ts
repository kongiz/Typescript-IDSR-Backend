import { Router }         from "express";
import { adminRegister }  from "../controllers/adminRegister.controller";
import verifyToken        from "../middleware/auth.middleware";
import { authLimiter }    from "../middleware/rateLimiter.middleware";
import { requireRole }    from "../middleware/roleGuard.middleware";

const router = Router();

router.post(
  "/adminRegister",
  authLimiter,
  verifyToken,
  requireRole("Admin", "Regional Officer"),
  adminRegister
);

export default router;