import { Request, Response }  from "express";
import bcrypt                 from "bcrypt";
import db                     from "../config/db";
import logger                 from "../config/logger";
import { adminRegisterSchema } from "../schemas/adminRegister.schema";
import * as otpService         from "../services/otp.service";
import { encryptUserFields }   from "../services/userEncryption.service";
import { hashForLookup }       from "../utils/encryption";
import { JwtDecoded }          from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

interface CreatorRow {
  role:        Role;
  region_id:   number | null;
  district_id: number | null;
}


export const adminRegister = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const creatorId = req.user?.id;

    if (!creatorId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    // zod schema validation with trimming of string fields
    const parsed = adminRegisterSchema.safeParse(
      Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ])
      )
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors:  parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      firstname, lastname, phone, email,
      gender, role, region_id, district_id, password,
    } = parsed.data;

    
    const creatorResult = await client.query<CreatorRow>(
      `SELECT role, region_id, district_id FROM users WHERE id = $1`,
      [creatorId]
    );

    if (creatorResult.rows.length === 0) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const creator          = creatorResult.rows[0];
    let   finalRegion:   number | null = region_id   ?? null;
    let   finalDistrict: number | null = district_id ?? null;

    if (creator.role === "Admin") {
      if (role === "Regional Officer" && !region_id) {
        res.status(400).json({ success: false, message: "Regional Officer requires a region ID" });
        return;
      }
      if (role === "District Officer" && (!region_id || !district_id)) {
        res.status(400).json({ success: false, message: "District Officer requires both region and district IDs" });
        return;
      }
    } else if (creator.role === "Regional Officer") {
      if (role === "Admin") {
        res.status(403).json({ success: false, message: "Regional Officers cannot create Admins" });
        return;
      }
      finalRegion = creator.region_id;
      if (role === "District Officer" && !district_id) {
        res.status(400).json({ success: false, message: "District Officer requires a district ID" });
        return;
      }
    } else {
      res.status(403).json({ success: false, message: "You are not allowed to create privileged users" });
      return;
    }

    await client.query("BEGIN");

    const emailHash = hashForLookup(email);
    const existing  = await client.query<{ id: number }>(
      `SELECT id FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ success: false, message: "Email already registered" });
      return;
    }

    if (finalRegion) {
      const regionCheck = await client.query(
        `SELECT 1 FROM health_regions WHERE region_id = $1`,
        [finalRegion]
      );
      if (regionCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ success: false, message: "Invalid region selected" });
        return;
      }
    }

    if (finalDistrict) {
      const districtCheck = await client.query(
        `SELECT 1 FROM health_district WHERE district_id = $1 AND region_id = $2`,
        [finalDistrict, finalRegion]
      );
      if (districtCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ success: false, message: "Invalid district for selected region" });
        return;
      }
    }

    const [hashedPassword, encrypted] = await Promise.all([
      bcrypt.hash(password, 10),
      Promise.resolve(encryptUserFields({ firstname, lastname, phone, email })),
    ]);

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO users
        (firstname, lastname, phone, email, email_hash, firstname_hash, lastname_hash,
         gender, role, region_id, district_id, password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        encrypted.firstname, encrypted.lastname, encrypted.phone ?? null, encrypted.email,
        encrypted.email_hash, encrypted.firstname_hash, encrypted.lastname_hash,
        gender ?? null, role, finalRegion, finalDistrict, hashedPassword,
      ]
    );

    await client.query("COMMIT");

    const newUserId = insertResult.rows[0].id;
    await otpService.sendVerificationOtp(newUserId, email, firstname);

    logger.info("Admin registered new user", { creatorId, newUserId, role });

    res.status(201).json({
      success:              true,
      message:              `${role} registered successfully. A verification code has been sent to ${email}.`,
      requiresVerification: true,
      email,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("adminRegister error", { error: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};