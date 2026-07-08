import { Router } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notifications.controller";
import verifyToken from "../middleware/auth.middleware";
import { generalLimiter, pollingLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

router.get(   "/",         verifyToken, pollingLimiter, getNotifications);
router.patch( "/:id/read", verifyToken, generalLimiter, markAsRead);
router.patch( "/read-all", verifyToken, generalLimiter, markAllAsRead);
router.delete("/:id",      verifyToken, generalLimiter, deleteNotification);

export default router;