import https from "https";
import logger from "../config/logger";
import env    from "../config/env";


interface SendEmailParams {
  to:      string;
  subject: string;
  text:    string;
}

interface BrevoPayload {
  sender:      { name: string; email: string };
  to:          { email: string }[];
  subject:     string;
  textContent: string;
}


export const sendEmail = async ({ to, subject, text }: SendEmailParams): Promise<boolean> => {
  try {
    const payload = JSON.stringify({
      sender:      { name: "IDSR Alert System", email: env.ALERT_EMAIL },
      to:          [{ email: to }],
      subject,
      textContent: text,
    } satisfies BrevoPayload);

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.brevo.com",
          path:     "/v3/smtp/email",
          method:   "POST",
          headers:  {
            "Content-Type":   "application/json",
            "api-key":        env.BREVO_API_KEY,
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Brevo API error: ${res.statusCode} ${data}`));
            }
          });
        }
      );

      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    logger.info("Email sent successfully", { to, subject });
    return true;
  } catch (error) {
    logger.error("Email send failed", { error: (error as Error).message, to, subject });
    return false;
  }
};