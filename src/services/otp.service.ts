import crypto       from "crypto";
import db           from "../config/db";
import { sendEmail } from "./email.service";
import logger       from "../config/logger";



type OtpType = "EMAIL_VERIFY" | "PASSWORD_RESET";

interface OtpRow {
  otp_code:       string | null;
  otp_expires_at: Date   | null;
  otp_type:       string | null;
}

interface VerifyOtpResult {
  valid:    boolean;
  message?: string;
}



export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function saveOtp(
  userId: number,
  otp:    string,
  type:   OtpType
): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.query(
    `UPDATE users
     SET otp_code = $1, otp_expires_at = $2, otp_type = $3
     WHERE id = $4`,
    [otp, expiresAt, type, userId]
  );
}

export async function verifyOtp(
  userId: number,
  otp:    string,
  type:   OtpType
): Promise<VerifyOtpResult> {
  const result = await db.query<OtpRow>(
    `SELECT otp_code, otp_expires_at, otp_type
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return { valid: false, message: "User not found" };

  const { otp_code, otp_expires_at, otp_type } = result.rows[0];

  if (otp_type !== type)                          return { valid: false, message: "Invalid OTP type" };
  if (otp_code !== otp)                           return { valid: false, message: "Invalid OTP code" };
  if (!otp_expires_at || new Date() > otp_expires_at) return { valid: false, message: "OTP has expired" };

  await db.query(
    `UPDATE users
     SET otp_code = NULL, otp_expires_at = NULL, otp_type = NULL
     WHERE id = $1`,
    [userId]
  );

  return { valid: true };
}



export async function sendVerificationOtp(
  userId:    number,
  email:     string,
  firstname: string
): Promise<void> {
  try {
    const otp = generateOtp();
    await saveOtp(userId, otp, "EMAIL_VERIFY");
    await sendEmail({
      to:      email,
      subject: "IDSR — Verify Your Email",
      text:    `Hello ${firstname},\n\nYour email verification code is:\n\n${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not create an account, please ignore this email.\n\nIDSR Team`,
    });
  } catch (err) {
    logger.error("sendVerificationOtp failed", { error: (err as Error).message, userId });
    throw err;
  }
}

export async function sendPasswordResetOtp(
  userId:    number,
  email:     string,
  firstname: string
): Promise<void> {
  try {
    const otp = generateOtp();
    await saveOtp(userId, otp, "PASSWORD_RESET");
    await sendEmail({
      to:      email,
      subject: "IDSR — Password Reset Code",
      text:    `Hello ${firstname},\n\nYour password reset code is:\n\n${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nIDSR Team`,
    });
  } catch (err) {
    logger.error("sendPasswordResetOtp failed", { error: (err as Error).message, userId });
    throw err;
  }
}