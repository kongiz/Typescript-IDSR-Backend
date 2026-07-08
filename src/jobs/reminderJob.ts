import cron from "node-cron";
import { sendWeeklySurveillanceReminder } from "../services/notificationFirebase.service";
import logger from "../config/logger";

// every Monday at 8:00 AM
export function startReminderJob(): void {
  cron.schedule("0 8 * * 1", async () => {
    logger.info("Running weekly surveillance reminder job...");
    await sendWeeklySurveillanceReminder();
  }, {
    timezone: "Africa/Banjul",
  });

  logger.info("Weekly surveillance reminder job scheduled (Mon 08:00 Banjul time)");
}