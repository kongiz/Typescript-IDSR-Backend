import db from "../config/db";
import { sendEmail } from "./email.service";
import { sendSMS }   from "./sms.service";
import logger from "../config/logger";


interface DistrictAlertParams {
  reportId:     number;
  district_id:  number;
  disease:      string;
  site:         string;
  reporterName: string;
  dateSeen:     string;
}

interface RegionalAlertParams {
  reportId:     number;
  region_id:    number;
  district_id:  number;
  disease:      string;
  site:         string;
  reporterName: string;
  dateSeen:     string;
}

interface NationalAlertParams {
  reportId:    number;
  disease:     string;
  district_id: number;
  region_id:   number;
}

interface Officer {
  id:     number;
  email:  string | null;
  phone:  string | null;
}

interface AdminRow {
  id: number;
}

interface AdminDetails {
  email: string | null;
  phone: string | null;
}

interface ThresholdRow {
  threshold_count:    number;
  time_window_hours:  number;
}


async function updateAlertDelivery(
  alertId: number,
  emailSent: boolean,
  smsSent: boolean
): Promise<void> {
  await db.query(
    `UPDATE annex2f_alerts
     SET email_sent = $1, sms_sent = $2
     WHERE id = $3`,
    [emailSent, smsSent, alertId]
  );
}


export const notifyDistrictOfficer = async ({
  reportId,
  district_id,
  disease,
  site,
  reporterName,
  dateSeen,
}: DistrictAlertParams): Promise<void> => {
  try {
    const result = await db.query<Officer>(
      `SELECT id, email, phone
       FROM users
       WHERE role = 'District Officer'
       AND district_id = $1`,
      [district_id]
    );

    for (const officer of result.rows) {
      const alertInsert = await db.query<{ id: number }>(
        `INSERT INTO annex2f_alerts (
          report_id, disease, district_id, recipient_user_id, alert_type, message
        ) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id`,
        [
          reportId, disease, district_id, officer.id,
          "DISTRICT",
          `Immediate case reported: ${disease} at ${site} on ${dateSeen} by ${reporterName}`,
        ]
      );

      const alertId  = alertInsert.rows[0].id;
      let emailSent  = false;
      let smsSent    = false;

      if (officer.email) {
        try {
          await sendEmail({
            to:      officer.email,
            subject: "Immediate Disease Alert",
            text:    `Immediate case of ${disease} reported at ${site} on ${dateSeen} by ${reporterName}.`,
          });
          emailSent = true;
        } catch (e) {
          logger.error("District email failed", { error: (e as Error).message });
        }
      }

      if (officer.phone) {
        try {
          await sendSMS({
            to:      officer.phone,
            message: `ALERT: ${disease} reported in your district at ${site} on ${dateSeen}.`,
          });
          smsSent = true;
        } catch (e) {
          logger.error("District SMS failed", { error: (e as Error).message });
        }
      }

      await updateAlertDelivery(alertId, emailSent, smsSent);
    }
  } catch (error) {
    logger.error("District Alert Error", { error });
  }
};


export const notifyRegionalOfficer = async ({
  reportId,
  region_id,
  district_id,
  disease,
  site,
  reporterName,
  dateSeen,
}: RegionalAlertParams): Promise<void> => {
  try {
    const result = await db.query<Officer>(
      `SELECT id, email, phone
       FROM users
       WHERE role = 'Regional Officer'
       AND region_id = $1`,
      [region_id]
    );

    for (const officer of result.rows) {
      const alertInsert = await db.query<{ id: number }>(
        `INSERT INTO annex2f_alerts (
          report_id, disease, region_id, district_id, recipient_user_id, alert_type, message
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id`,
        [
          reportId, disease, region_id, district_id, officer.id,
          "REGIONAL",
          `Escalated immediate case: ${disease} reported in district ${district_id} at ${site} on ${dateSeen}`,
        ]
      );

      const alertId  = alertInsert.rows[0].id;
      let emailSent  = false;
      let smsSent    = false;

      if (officer.email) {
        try {
          await sendEmail({
            to:      officer.email,
            subject: "Regional Immediate Case Alert",
            text:    `Immediate case reported.\n\nDisease: ${disease}\nDistrict: ${district_id}\nLocation: ${site}\nDate Seen: ${dateSeen}\nReported By: ${reporterName}\n\nPlease review immediately.`,
          });
          emailSent = true;
        } catch (e) {
          logger.error("Regional email failed", { error: (e as Error).message });
        }
      }

      if (officer.phone) {
        try {
          await sendSMS({
            to:      officer.phone,
            message: `REGIONAL ALERT: ${disease} reported in district ${district_id} at ${site} on ${dateSeen}.`,
          });
          smsSent = true;
        } catch (e) {
          logger.error("Regional SMS failed", { error: (e as Error).message });
        }
      }

      await updateAlertDelivery(alertId, emailSent, smsSent);
    }
  } catch (error) {
    logger.error("Regional Alert Error", { error });
  }
};



export const triggerNationalAlertCheck = async ({
  reportId,
  disease,
  district_id,
  region_id,
}: NationalAlertParams): Promise<void> => {
  try {
    const thresholdResult = await db.query<ThresholdRow>(
      `SELECT threshold_count, time_window_hours
       FROM annex2f_disease_thresholds
       WHERE disease_name = $1 AND is_active = TRUE`,
      [disease]
    );

    if (thresholdResult.rows.length === 0) return;

    const { threshold_count, time_window_hours } = thresholdResult.rows[0];

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM annex2f_immediate_case_reports
       WHERE disease = $1
       AND district_id = $2
       AND created_at >= NOW() - INTERVAL '${time_window_hours} HOURS'`,
      [disease, district_id]
    );

    const count = Number(countResult.rows[0].count);
    if (count < threshold_count) return;

    const admins = await db.query<AdminRow>(
      `SELECT id FROM users WHERE role = 'Admin'`
    );

    for (const admin of admins.rows) {
      const alertInsert = await db.query<{ id: number }>(
        `INSERT INTO annex2f_alerts (
          report_id, disease, region_id, district_id, recipient_user_id, alert_type, message
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id`,
        [
          reportId, disease, region_id, district_id, admin.id,
          "NATIONAL",
          `NATIONAL ALERT: ${count} cases of ${disease} in ${time_window_hours} hours in district ${district_id}`,
        ]
      );

      const alertId  = alertInsert.rows[0].id;
      let emailSent  = false;
      let smsSent    = false;

      const adminDetails = await db.query<AdminDetails>(
        `SELECT email, phone FROM users WHERE id = $1`,
        [admin.id]
      );
      const adminUser = adminDetails.rows[0];

      if (adminUser?.email) {
        try {
          await sendEmail({
            to:      adminUser.email,
            subject: "NATIONAL DISEASE ALERT",
            text:    `NATIONAL ALERT\n\nDisease: ${disease}\nDistrict: ${district_id}\nRegion: ${region_id}\nCases: ${count} in the last ${time_window_hours} hours\n\nImmediate action required.`,
          });
          emailSent = true;
        } catch (e) {
          logger.error("National email failed", { error: (e as Error).message });
        }
      }

      if (adminUser?.phone) {
        try {
          await sendSMS({
            to:      adminUser.phone,
            message: `NATIONAL ALERT: ${count} cases of ${disease} in district ${district_id} in ${time_window_hours} hours.`,
          });
          smsSent = true;
        } catch (e) {
          logger.error("National SMS failed", { error: (e as Error).message });
        }
      }

      await updateAlertDelivery(alertId, emailSent, smsSent);
    }
  } catch (error) {
    logger.error("National Alert Error", { error });
  }
};