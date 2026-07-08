import { Request, Response } from "express";
import bcrypt                from "bcrypt";
import db                    from "../config/db";
import logger                from "../config/logger";
import * as otpService       from "../services/otp.service";
import { hashForLookup }     from "../utils/encryption";
import { decryptUserFields } from "../services/userEncryption.service";



interface UserLookupRow {
  id:          number;
  firstname?:  string | null;
  is_verified?: boolean;
  [key: string]: unknown;
}

interface OtpRow {
  otp_code:       string | null;
  otp_expires_at: Date   | null;
  otp_type:       string | null;
}



export const resendVerificationOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    const emailHash = hashForLookup(email);
    const result    = await db.query<UserLookupRow>(
      `SELECT id, firstname, is_verified FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    const user = decryptUserFields(result.rows[0]);

    if (!user) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    if (user.is_verified) {
      res.status(400).json({ success: false, message: "Email is already verified" });
      return;
    }

    await otpService.sendVerificationOtp(
      user.id as number,
      email,
      user.firstname as string
    );

    res.json({ success: true, message: "Verification code sent to your email" });

  } catch (err) {
    logger.error("resendVerificationOtp error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      res.status(400).json({ success: false, message: "Email and OTP are required" });
      return;
    }

    const emailHash = hashForLookup(email);
    const result    = await db.query<{ id: number }>(
      `SELECT id FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    const userId      = result.rows[0].id;
    const verification = await otpService.verifyOtp(userId, otp, "EMAIL_VERIFY");

    if (!verification.valid) {
      res.status(400).json({ success: false, message: verification.message });
      return;
    }

    await db.query(
      `UPDATE users SET is_verified = TRUE WHERE id = $1`,
      [userId]
    );

    res.json({ success: true, message: "Email verified successfully. You can now login." });

  } catch (err) {
    logger.error("verifyEmail error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    const emailHash = hashForLookup(email);
    const result    = await db.query<UserLookupRow>(
      `SELECT id, firstname FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    // Always return same message to prevent email enumeration
    if (result.rows.length === 0) {
      res.json({ success: true, message: "If this email exists, a reset code has been sent" });
      return;
    }

    const user = decryptUserFields(result.rows[0]);
    if (!user) {
      res.json({ success: true, message: "If this email exists, a reset code has been sent" });
      return;
    }

    await otpService.sendPasswordResetOtp(
      user.id as number,
      email,
      user.firstname as string
    );

    res.json({ success: true, message: "Password reset code sent to your email" });

  } catch (err) {
    logger.error("forgotPassword error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const verifyResetOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      res.status(400).json({ success: false, message: "Email and OTP are required" });
      return;
    }

    const emailHash = hashForLookup(email);
    const result    = await db.query<{ id: number }>(
      `SELECT id FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    const userId = result.rows[0].id;
    const otpRow = await db.query<OtpRow>(
      `SELECT otp_code, otp_expires_at, otp_type FROM users WHERE id = $1`,
      [userId]
    );

    const { otp_code, otp_expires_at, otp_type } = otpRow.rows[0];

    if (otp_type !== "PASSWORD_RESET") {
      res.status(400).json({ success: false, message: "Invalid OTP type" });
      return;
    }
    if (otp_code !== otp) {
      res.status(400).json({ success: false, message: "Invalid OTP code" });
      return;
    }
    if (!otp_expires_at || new Date() > otp_expires_at) {
      res.status(400).json({ success: false, message: "OTP has expired" });
      return;
    }

    res.json({ success: true, message: "OTP verified. You can now reset your password." });

  } catch (err) {
    logger.error("verifyResetOtp error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body as {
      email?:       string;
      otp?:         string;
      newPassword?: string;
    };

    if (!email || !otp || !newPassword) {
      res.status(400).json({ success: false, message: "All fields are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
      return;
    }

    const emailHash = hashForLookup(email);
    const result    = await db.query<{ id: number }>(
      `SELECT id FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Account not found" });
      return;
    }

    const userId      = result.rows[0].id;
    const verification = await otpService.verifyOtp(userId, otp, "PASSWORD_RESET");

    if (!verification.valid) {
      res.status(400).json({ success: false, message: verification.message });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );

    res.json({ success: true, message: "Password reset successfully. You can now login." });

  } catch (err) {
    logger.error("resetPassword error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};