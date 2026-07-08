import twilio from "twilio";
import logger from "../config/logger";
import env    from "../config/env";


interface SendSmsParams {
  to:      string;
  message: string;
}

interface SendSmsResult {
  success: boolean;
  sid?:    string;
  error?:  string;
}


const client = twilio(env.TWILIO_SID, env.TWILIO_AUTH_TOKEN);


export const sendSMS = async ({ to, message }: SendSmsParams): Promise<SendSmsResult> => {
  const normalized = to.startsWith("+") ? to : `+220${to}`;

  try {
    const result = await client.messages.create({
      body: message,
      from: env.TWILIO_PHONE,
      to:   normalized,
    });

    logger.info("SMS sent", { sid: result.sid, to: normalized });
    return { success: true, sid: result.sid };
  } catch (err) {
    logger.error("SMS failed", { error: (err as Error).message, to: normalized });
    return { success: false, error: (err as Error).message };
  }
};