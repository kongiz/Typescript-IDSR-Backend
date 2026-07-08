import { Request, Response } from "express";
import bcrypt                from "bcrypt";
import db                    from "../config/db";
import logger                from "../config/logger";
import { selfRegisterSchema } from "../schemas/selfRegister.schema";
import * as otpService        from "../services/otp.service";
import { encryptUserFields }  from "../services/userEncryption.service";
import { hashForLookup }      from "../utils/encryption";

export const selfRegister = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();


  // Validate request body and sanitize with zod schema
  try {
    const parsed = selfRegisterSchema.safeParse(
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

    await client.query("BEGIN");

    const emailHash    = hashForLookup(email);
    const existingUser = await client.query<{ id: number }>(
      `SELECT id FROM users WHERE email_hash = $1`,
      [emailHash]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ success: false, message: "Email already registered" });
      return;
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
        gender ?? null, role, region_id ?? null, district_id ?? null, hashedPassword,
      ]
    );

    await client.query("COMMIT");

    const newUserId = insertResult.rows[0].id;
    await otpService.sendVerificationOtp(newUserId, email, firstname);

    logger.info("New user self-registered", { newUserId, role });

    res.status(201).json({
      success:              true,
      message:              "Account created. Please check your email for a verification code.",
      requiresVerification: true,
      email,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("selfRegister error", { error: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};