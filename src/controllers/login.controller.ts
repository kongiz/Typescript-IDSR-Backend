import { Request, Response } from "express";
import jwt                   from "jsonwebtoken";
import bcrypt                from "bcrypt";
import { randomUUID }        from "crypto";
import db                    from "../config/db";
import logger                from "../config/logger";
import env                   from "../config/env";
import { hashForLookup }     from "../utils/encryption";
import { decryptUserFields } from "../services/userEncryption.service";
import { audit }             from "../services/audit.service";
import { blacklistToken }    from "../middleware/tokenBlacklist.middleware";
import {
 recordFailedAttempt,
  clearFailedAttempts,
} from "../middleware/loginLockout.middleware";
import { JwtDecoded } from "../types/jwt";



interface LoginUserRow {
  id:          number;
  firstname:   string | null;
  lastname:    string | null;
  email:       string | null;
  phone:       string | null;
  password:    string;
  role:        string | null;
  region_id:   number | null;
  district_id: number | null;
  is_verified: boolean;
  is_active:   boolean;
  [key: string]: unknown;
}


export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Email and password are required" });
      return;
    }

    const emailHash  = hashForLookup(email);
    const userResult = await db.query<LoginUserRow>(
      `SELECT id, firstname, lastname, email, phone, password,
              role, region_id, district_id, is_verified, is_active
       FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (userResult.rows.length === 0) {
      await recordFailedAttempt(email);
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const decrypted = decryptUserFields(userResult.rows[0]);
    if (!decrypted) {
      res.status(500).json({ success: false, message: "Server error" });
      return;
    }

    const user = decrypted as unknown as LoginUserRow;

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await recordFailedAttempt(email);
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    if (!user.is_verified) {
      res.status(403).json({
        success:              false,
        message:              "Please verify your email before logging in.",
        requiresVerification: true,
        email:                user.email,
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact your administrator.",
      });
      return;
    }


    const issuedAt            = Math.floor(Date.now() / 1000);
    const accessExpirySeconds = parseInt(env.JWT_EXPIRES_IN) * 60 || 3600;
    const jti                 = randomUUID();

    const tokenData: JwtDecoded["data"] = {
      id:          user.id,
      role:        user.role        as JwtDecoded["data"]["role"],
      region_id:   user.region_id   ?? undefined,
      district_id: user.district_id ?? undefined,
    };

    const accessToken = jwt.sign(
      {
        jti,
        iat:  issuedAt,
        exp:  issuedAt + accessExpirySeconds,
        data: tokenData,
      },
      env.JWT_ACCESS_SECRET
    );

    const refreshExpirySeconds = parseInt(env.JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60;

    const refreshToken = jwt.sign(
      {
        iat:  issuedAt,
        exp:  issuedAt + refreshExpirySeconds,
        data: { id: user.id },
      },
      env.JWT_REFRESH_SECRET
    );

    const hashedRefresh = await bcrypt.hash(refreshToken, 10);

    const expiryDate = new Date(Date.now() + refreshExpirySeconds * 1000);

    await db.query(
      `INSERT INTO user_tokens (user_id, refresh_token, expiry)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET refresh_token = $2, expiry = $3`,
      [user.id, hashedRefresh, expiryDate]
    );

    await clearFailedAttempts(email);

    await audit({
      userId:    user.id,
      action:    "LOGIN",
      resource:  "AUTH",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
      metadata:  { role: user.role },
    });

    res.status(200).json({
      success:       true,
      access_token:  accessToken,
      refresh_token: refreshToken,
      user: {
        id:          user.id,
        firstname:   user.firstname,
        lastname:    user.lastname,
        email:       user.email,
        phone:       user.phone       ?? null,
        role:        user.role        ?? null,
        region_id:   user.region_id   ?? null,
        district_id: user.district_id ?? null,
      },
    });

  } catch (error) {
    logger.error("Login error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};



export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId        = req.user!.id;
    const { fcm_token } = req.body as { fcm_token?: string };

    if (req.decoded) {
      await blacklistToken(req.decoded);
    }

    await db.query(
      `DELETE FROM user_tokens WHERE user_id = $1`,
      [userId]
    );

    if (fcm_token) {
      await db.query(
        `DELETE FROM user_fcm_tokens WHERE user_id = $1 AND fcm_token = $2`,
        [userId, fcm_token]
      );
    } else {
      await db.query(
        `DELETE FROM user_fcm_tokens WHERE user_id = $1`,
        [userId]
      );
    }

    await audit({
      userId,
      action:    "LOGOUT",
      resource:  "AUTH",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });

  } catch (error) {
    logger.error("Logout error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};