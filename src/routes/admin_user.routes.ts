import { Router }          from "express";
import { getAllUsers, updateUserStatus, updateUserRole } from "../controllers/admin_user.controller";
import verifyToken         from "../middleware/auth.middleware";
import { requireRole }     from "../middleware/roleGuard.middleware";
import { generalLimiter }  from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(
  "/admin/users",
  generalLimiter,
  verifyToken,
  requireRole("Admin"),
  getAllUsers
);

router.patch(
  "/admin/users/:id/status",
  generalLimiter,
  verifyToken,
  requireRole("Admin"),
  updateUserStatus
);

router.patch(
  "/admin/users/:id/role",
  generalLimiter,
  verifyToken,
  requireRole("Admin"),
  updateUserRole
);

export default router;