import db     from "../config/db";
import admin  from "../config/firebase";
import logger from "../config/logger";
import { JwtDecoded } from "../types/jwt";



type Role = JwtDecoded["data"]["role"];

interface NotificationParams {
  user_id:        number;
  title:          string;
  body:           string;
  type:           string;
  reference_id:   number | null;
  reference_type: string | null;
}

interface NotifyByRoleParams {
  roles:          Role[];
  title:          string;
  body:           string;
  type:           string;
  reference_id:   number | null;
  reference_type: string | null;
}

type PushData = Record<string, string>;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}



async function saveNotification({
  user_id,
  title,
  body,
  type,
  reference_id,
  reference_type,
}: NotificationParams): Promise<void> {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user_id, title, body, type, reference_id ?? null, reference_type ?? null]
    );
  } catch (err) {
    logger.error("saveNotification error", { error: (err as Error).message });
  }
}

async function getFcmTokens(user_id: number): Promise<string[]> {
  try {
    const result = await db.query<{ fcm_token: string }>(
      `SELECT fcm_token FROM user_fcm_tokens WHERE user_id = $1`,
      [user_id]
    );
    return result.rows.map(r => r.fcm_token);
  } catch (err) {
    logger.error("getFcmTokens error", { error: (err as Error).message });
    return [];
  }
}

async function getFcmTokensByRole(roles: Role[]): Promise<string[]> {
  try {
    const result = await db.query<{ fcm_token: string }>(
      `SELECT t.fcm_token
       FROM user_fcm_tokens t
       JOIN users u ON t.user_id = u.id
       WHERE u.role = ANY($1)`,
      [roles]
    );
    return result.rows.map(r => r.fcm_token);
  } catch (err) {
    logger.error("getFcmTokensByRole error", { error: (err as Error).message });
    return [];
  }
}

async function getUserIdsByRole(roles: Role[]): Promise<number[]> {
  try {
    const result = await db.query<{ id: number }>(
      `SELECT id FROM users WHERE role = ANY($1)`,
      [roles]
    );
    return result.rows.map(r => r.id);
  } catch (err) {
    logger.error("getUserIdsByRole error", { error: (err as Error).message });
    return [];
  }
}

async function sendPush(
  tokens: string[],
  title:  string,
  body:   string,
  data:   PushData = { type: "" }
): Promise<void> {
  if (!tokens.length) return;

  const chunks = chunkArray(tokens, 500);

  for (const chunk of chunks) {
    try {
      const messages = chunk.map(token => ({
        token,
        notification: { title, body },
        data,
        android: {
          priority:     "high" as const,
          notification: {
            sound:     "default",
            channelId: "idsr_notifications",
          },
        },
      }));

      const response = await admin.messaging().sendEach(messages);

      
      const deletions = response.responses
        .map((resp, idx) => {
            if (!resp.success) {
            const code = resp.error?.code;
            if (
                code === "messaging/invalid-registration-token" ||
                code === "messaging/registration-token-not-registered"
            ) {
                return db.query(
                `DELETE FROM user_fcm_tokens WHERE fcm_token = $1`,
                [chunk[idx]]
                ) as Promise<unknown>;
            }
            }
            return null;
        })
        .filter((p): p is Promise<unknown> => p !== null);

      await Promise.all(deletions);

    } catch (err) {
      logger.error("sendPush error", { error: (err as Error).message });
    }
  }
}



export const notifyUser = async ({
  user_id,
  title,
  body,
  type,
  reference_id,
  reference_type,
}: NotificationParams): Promise<void> => {
  await saveNotification({ user_id, title, body, type, reference_id, reference_type });
  const tokens = await getFcmTokens(user_id);
  await sendPush(tokens, title, body, {
    type,
    reference_id:   String(reference_id ?? ""),
    reference_type: reference_type ?? "",
  });
};

export const notifyByRole = async ({
  roles,
  title,
  body,
  type,
  reference_id,
  reference_type,
}: NotifyByRoleParams): Promise<void> => {
  const [userIds, tokens] = await Promise.all([
    getUserIdsByRole(roles),
    getFcmTokensByRole(roles),
  ]);

  await Promise.all(
    userIds.map(uid =>
      saveNotification({ user_id: uid, title, body, type, reference_id, reference_type })
    )
  );

  await sendPush(tokens, title, body, {
    type,
    reference_id:   String(reference_id ?? ""),
    reference_type: reference_type ?? "",
  });
};

export const sendWeeklySurveillanceReminder = async (): Promise<void> => {
  try {
    const title = "Weekly Surveillance Report Due";
    const body  = "Please submit your weekly surveillance report before end of the day.";

    const [userIds, tokens] = await Promise.all([
      getUserIdsByRole(["Health Officer"]),
      getFcmTokensByRole(["Health Officer"]),
    ]);

    await Promise.all(
      userIds.map(uid =>
        saveNotification({
          user_id:        uid,
          title,
          body,
          type:           "REMINDER",
          reference_id:   null,
          reference_type: null,
        })
      )
    );

    await sendPush(tokens, title, body, { type: "REMINDER" });
    logger.info(`Weekly reminder sent to ${userIds.length} health officers`);
  } catch (err) {
    logger.error("sendWeeklySurveillanceReminder error", { error: (err as Error).message });
  }
};

export { saveNotification, getFcmTokens };