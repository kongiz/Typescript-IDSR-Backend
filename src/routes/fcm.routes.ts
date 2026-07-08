import { Router, Request, Response } from "express";
import db          from "../config/db";
import logger      from "../config/logger";
import verifyToken from "../middleware/auth.middleware";

const router = Router();

router.post("/fcm-token", verifyToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { fcm_token, device_id } = req.body as {
      fcm_token?: string;
      device_id?: string;
    };

    if (!fcm_token) {
      res.status(400).json({ success: false, message: "FCM token required" });
      return;
    }

    await db.query(
      `INSERT INTO user_fcm_tokens (user_id, fcm_token, device_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET fcm_token = $2, updated_at = NOW()`,
      [req.user!.id, fcm_token, device_id ?? "default"]
    );

    res.json({ success: true, message: "FCM token saved" });
  } catch (err) {
    logger.error("fcm-token save error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Failed to save FCM token" });
  }
});

export default router;