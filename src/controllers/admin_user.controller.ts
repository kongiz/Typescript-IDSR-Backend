import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";
import { decryptUserList, decryptUserFields } from "../services/userEncryption.service";
import { hashForLookup }                      from "../utils/encryption";
import { JwtDecoded }                         from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

const VALID_ROLES: Role[] = [
  "Admin",
  "Regional Officer",
  "District Officer",
  "Health Officer",
  "Clinician",
  "Lab Technician",
  "Community Health Worker",
];

interface GetAllUsersQuery {
  role?:        string;
  region_id?:   string;
  district_id?: string;
  is_active?:   string;
  search?:      string;
}

interface UpdateStatusBody {
  is_active: boolean;
}

interface UpdateRoleBody {
  role: string;
}


export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, region_id, district_id, is_active, search } =
      req.query as GetAllUsersQuery;

    let query = `
      SELECT
        u.id, u.firstname, u.lastname, u.email, u.phone,
        u.role, u.is_active, u.is_verified, u.created_at,
        r.region_name, d.district_name
      FROM users u
      LEFT JOIN health_regions  r ON u.region_id   = r.region_id
      LEFT JOIN health_district d ON u.district_id = d.district_id
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let idx = 1;

    if (role) {
      query += ` AND u.role = $${idx++}`;
      params.push(role);
    }
    if (region_id) {
      query += ` AND u.region_id = $${idx++}`;
      params.push(parseInt(region_id));
    }
    if (district_id) {
      query += ` AND u.district_id = $${idx++}`;
      params.push(parseInt(district_id));
    }
    if (is_active !== undefined) {
      query += ` AND u.is_active = $${idx++}`;
      params.push(is_active === "true");
    }
    if (search) {
      const searchHash = hashForLookup(search);
      query += ` AND (
        u.firstname_hash = $${idx}  OR
        u.lastname_hash  = $${idx}  OR
        u.role           = $${idx}  OR
        u.region_id      = $${idx}  OR
        u.district_id    = $${idx}  OR
        u.email_hash     = $${idx}
      )`;
      params.push(searchHash);
      idx++;
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await db.query(query, params);
    const users  = decryptUserList(result.rows);

    res.json({ success: true, data: users });
  } catch (error) {
    logger.error("getAllUsers error", { error: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id                      = parseInt(req.params.id as string);
    const { is_active }           = req.body as UpdateStatusBody;

    if (typeof is_active !== "boolean") {
      res.status(400).json({ success: false, message: "is_active must be a boolean" });
      return;
    }

    const result = await db.query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, firstname, lastname, is_active`,
      [is_active, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const user = decryptUserFields(result.rows[0]);
    logger.info("User status updated", { userId: user?.id, is_active });

    res.json({
      success: true,
      message: `User ${is_active ? "activated" : "deactivated"} successfully`,
      data:    user,
    });
  } catch (error) {
    logger.error("updateUserStatus error", { error: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id            = parseInt(req.params.id as string);
    const { role }      = req.body as UpdateRoleBody;

    if (!role || !VALID_ROLES.includes(role as Role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
      });
      return;
    }

    if (id === req.user?.id) {
      res.status(400).json({ success: false, message: "You cannot change your own role" });
      return;
    }

    const result = await db.query(
      `UPDATE users SET role = $1 WHERE id = $2
       RETURNING id, firstname, lastname, role`,
      [role, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const user = decryptUserFields(result.rows[0]);
    logger.info("User role updated", { userId: user?.id, role });

    res.json({
      success: true,
      message: "User role updated successfully",
      data:    user,
    });
  } catch (error) {
    logger.error("updateUserRole error", { error: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ success: false, message: "Server error" });
  }
};