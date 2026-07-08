import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";


interface NotificationRow {
  id:         number;
  user_id:    number;
  title:      string;
  body:       string;
  type:       string;
  is_read:    boolean;
  created_at: Date;
}


export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page   = Math.max(1, parseInt((req.query.page  as string) ?? "1"));
    const limit  = Math.min(50, parseInt((req.query.limit as string) ?? "20"));
    const offset = (page - 1) * limit;

    const [dataResult, countResult, unreadResult] = await Promise.all([
      db.query<NotificationRow>(
        `SELECT * FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1`,
        [userId]
      ),
      db.query<{ unread: string }>(
        `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = false`,
        [userId]
      ),
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success:       true,
      unread_count:  parseInt(unreadResult.rows[0].unread),
      total_records: total,
      total_pages:   Math.ceil(total / limit),
      page,
      limit,
      data:          dataResult.rows,
    });

  } catch (err) {
    logger.error("getNotifications error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [parseInt(req.params.id as string), req.user!.id]
    );
    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    logger.error("markAsRead error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Failed to mark as read" });
  }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [req.user!.id]
    );
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    logger.error("markAllAsRead error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Failed to mark all as read" });
  }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    await db.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [parseInt(req.params.id as string), req.user!.id]
    );
    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    logger.error("deleteNotification error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
};