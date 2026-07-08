import { Request, Response }      from "express";
import db                         from "../config/db";
import logger                     from "../config/logger";
import { decrypt, hashForLookup } from "../utils/encryption";
import { audit }                  from "../services/audit.service";
import { JwtDecoded }             from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

interface UserRow {
  role:        Role;
  region_id:   number | null;
  district_id: number | null;
}

interface SpecimenReportRow {
  id:                  number;
  submitted_firstname: string | null | undefined;
  submitted_lastname:  string | null | undefined;
  [key: string]:       unknown;
}

interface QueryParams {
  page?:                 string;
  limit?:                string;
  region_id?:            string;
  district_id?:          string;
  dateSpecimenCollect?:  string;
  search?:               string;
}


export const getSpecimenReports = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const userId = req.user!.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const {
      page: pageStr, limit: limitStr,
      region_id, district_id,
      dateSpecimenCollect, search,
    } = req.query as QueryParams;

    const page   = Math.max(1, parseInt(pageStr  ?? "1"));
    const limit  = Math.min(100, parseInt(limitStr ?? "20"));
    const offset = (page - 1) * limit;


    const userResult = await client.query<UserRow>(
      `SELECT role, region_id, district_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const { role, region_id: userRegion, district_id: userDistrict } = userResult.rows[0];

    // Build dynamic WHERE clause based on user role and query parameters

    const conditions: string[]  = [];
    const params:     unknown[] = [];

    const addParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (role === "Regional Officer") {
      conditions.push(`u.region_id = ${addParam(userRegion)}`);
    } else if (role === "District Officer") {
      conditions.push(`u.district_id = ${addParam(userDistrict)}`);
    } else if (role !== "Admin") {
      conditions.push(`ls.user_id = ${addParam(userId)}`);
    }

    if (region_id) {
      conditions.push(`u.region_id = ${addParam(parseInt(region_id))}`);
    }
    if (district_id) {
      conditions.push(`u.district_id = ${addParam(parseInt(district_id))}`);
    }
    if (dateSpecimenCollect) {
      conditions.push(`ls.date_specimen_collect >= ${addParam(dateSpecimenCollect)}`);
    }
    if (search) {
      const term       = `%${search.trim()}%`;
      const searchHash = hashForLookup(search);
      conditions.push(`(
        ls.patient_name       ILIKE ${addParam(term)}       OR
        ls.specimen_unique_id ILIKE ${addParam(term)}       OR
        u.firstname_hash      =     ${addParam(searchHash)} OR
        u.lastname_hash       =     ${addParam(searchHash)}
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const joins = `
      FROM laboratory_report_form_with_specimen ls
      LEFT JOIN users           u ON ls.user_id    = u.id
      LEFT JOIN health_regions  r ON u.region_id   = r.region_id
      LEFT JOIN health_district d ON u.district_id = d.district_id
    `;

    const countParams = [...params];
    const dataParams  = [...params, limit, offset];

    // Execute both queries in parallel for efficiency

    const [dataResult, countResult] = await Promise.all([
      client.query<SpecimenReportRow>(
        `SELECT
          ls.*,
          u.firstname AS submitted_firstname,
          u.lastname  AS submitted_lastname,
          r.region_name,
          d.district_name
         ${joins}
         ${where}
         ORDER BY ls.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        dataParams
      ),
      client.query<{ total: string }>(
        `SELECT COUNT(*) AS total ${joins} ${where}`,
        countParams
      ),
    ]);

    const total = parseInt(countResult.rows[0].total);

    // Map the results to include decrypted full names and remove the individual name fields

    const results = dataResult.rows.map(row => ({
      ...row,
      full_name: row.submitted_firstname && row.submitted_lastname
        ? `${decrypt(row.submitted_firstname)} ${decrypt(row.submitted_lastname)}`
        : null,
      submitted_firstname: undefined,
      submitted_lastname:  undefined,
    }));

    
    await audit({
      userId,
      action:    "VIEW",
      resource:  "SPECIMEN_REPORT",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
      metadata:  {
        count:   results.length,
        page,
        filters: { region_id, district_id, dateSpecimenCollect, search },
      },
    });

    res.json({
      success: true,
      data: {
        role,
        page,
        limit,
        total_records: total,
        total_pages:   Math.ceil(total / limit),
        results,
      },
    });

  } catch (error) {
    logger.error("getSpecimenReports error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to fetch specimen reports" });

  } finally {
    client.release();
  }
};