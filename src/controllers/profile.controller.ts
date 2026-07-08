import { Request, Response }                       from "express";
import bcrypt                                      from "bcrypt";
import db                                          from "../config/db";
import logger                                      from "../config/logger";
import { decryptUserFields, encryptUserFields }    from "../services/userEncryption.service";
import { audit }                                   from "../services/audit.service";



interface ProfileRow {
  id:            number;
  firstname:     string | null;
  lastname:      string | null;
  email:         string | null;
  phone:         string | null;
  gender:        string | null;
  role:          string | null;
  is_verified:   boolean;
  created_at:    Date;
  region_name:   string | null;
  district_name: string | null;
  [key: string]: unknown;
}

interface UpdateProfileBody {
  firstname?: string;
  lastname?:  string;
  phone?:     string;
}

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?:     string;
}


export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await db.query<ProfileRow>(
      `SELECT
        u.id, u.firstname, u.lastname, u.email, u.phone,
        u.gender, u.role, u.is_verified, u.created_at,
        hr.region_name,
        hd.district_name
       FROM users u
       LEFT JOIN health_regions  hr ON u.region_id   = hr.region_id
       LEFT JOIN health_district hd ON u.district_id = hd.district_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const user = decryptUserFields(result.rows[0]);

    await audit({
      userId,
      action:     "VIEW",
      resource:   "USER_PROFILE",
      resourceId: userId,
      ipAddress:  req.ip,
      userAgent:  req.headers["user-agent"] as string,
    });

    res.json({ success: true, data: user });

  } catch (err) {
    logger.error("getProfile error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId                   = req.user!.id;
    const { firstname, lastname, phone } = req.body as UpdateProfileBody;

    if (!firstname || !lastname) {
      res.status(400).json({ success: false, message: "First and last name are required" });
      return;
    }

    const encrypted = encryptUserFields({
      firstname: firstname.trim(),
      lastname:  lastname.trim(),
      phone:     phone?.trim() ?? null,
    });

    await db.query(
      `UPDATE users
       SET firstname      = $1,
           lastname       = $2,
           phone          = $3,
           firstname_hash = $4,
           lastname_hash  = $5
       WHERE id = $6`,
      [
        encrypted.firstname,
        encrypted.lastname,
        encrypted.phone     ?? null,
        encrypted.firstname_hash,
        encrypted.lastname_hash,
        userId,
      ]
    );

    await audit({
      userId,
      action:     "UPDATE",
      resource:   "USER_PROFILE",
      resourceId: userId,
      ipAddress:  req.ip,
      userAgent:  req.headers["user-agent"] as string,
      metadata:   { fields_updated: ["firstname", "lastname", "phone"] },
    });

    res.json({ success: true, message: "Profile updated successfully" });

  } catch (err) {
    logger.error("updateProfile error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};



export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body as ChangePasswordBody;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: "All fields are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ success: false, message: "New password must be different from current password" });
      return;
    }

    const result = await db.query<{ password: string }>(
      `SELECT password FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isMatch) {
      res.status(400).json({ success: false, message: "Current password is incorrect" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );

    await audit({
      userId,
      action:     "UPDATE",
      resource:   "USER_PROFILE",
      resourceId: userId,
      ipAddress:  req.ip,
      userAgent:  req.headers["user-agent"] as string,
    });

    res.json({ success: true, message: "Password changed successfully" });

  } catch (err) {
    logger.error("changePassword error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};