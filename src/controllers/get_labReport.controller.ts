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

interface LabReportRow {
  id:                  number;
  lab_result_images:   string[];
  submitted_firstname: string | null | undefined;
  submitted_lastname:  string | null | undefined;
  [key: string]:       unknown;
}

interface QueryParams {
  page?:              string;
  limit?:             string;
  region_id?:         string;
  district_id?:       string;
  result_type?:       string;
  date_lab_received?: string;
  search?:            string;
}


export const getLabReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const {
      page: pageStr, limit: limitStr,
      region_id, district_id,
      result_type, date_lab_received, search,
    } = req.query as QueryParams;

    const page   = Math.max(1, parseInt(pageStr  ?? "1"));
    const limit  = Math.min(100, parseInt(limitStr ?? "20"));
    const offset = (page - 1) * limit;


    const userResult = await db.query<UserRow>(
      `SELECT role, region_id, district_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const { role, region_id: userRegion, district_id: userDistrict } = userResult.rows[0];

    const whereClauses: string[]  = [];
    const params:       unknown[] = [];
    let   paramIndex = 1;

    if (role === "Regional Officer") {
      whereClauses.push(`u.region_id = $${paramIndex++}`);
      params.push(userRegion);
    } else if (role === "District Officer") {
      whereClauses.push(`u.district_id = $${paramIndex++}`);
      params.push(userDistrict);
    } else if (role !== "Admin") {
      whereClauses.push(`lr.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (region_id) {
      whereClauses.push(`u.region_id = $${paramIndex++}`);
      params.push(region_id);
    }
    if (district_id) {
      whereClauses.push(`u.district_id = $${paramIndex++}`);
      params.push(district_id);
    }
    if (result_type) {
      whereClauses.push(`lr.final_lab_result = $${paramIndex++}`);
      params.push(result_type);
    }
    if (date_lab_received) {
      whereClauses.push(`lr.date_lab_received >= $${paramIndex++}`);
      params.push(date_lab_received);
    }
    if (search) {
      const searchHash = hashForLookup(search);
      whereClauses.push(`(
        lr.lab_name           ILIKE $${paramIndex}     OR
        lr.specimen_condition ILIKE $${paramIndex}     OR
        r.region_name         ILIKE $${paramIndex}     OR
        d.district_name       ILIKE $${paramIndex}     OR
        u.firstname_hash      =     $${paramIndex + 1} OR
        u.lastname_hash       =     $${paramIndex + 1}
      )`);
      params.push(`%${search}%`, searchHash);
      paramIndex += 2;
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const joins = `
      FROM laboratory_reports lr
      LEFT JOIN users           u ON lr.user_id    = u.id
      LEFT JOIN health_regions  r ON u.region_id   = r.region_id
      LEFT JOIN health_district d ON u.district_id = d.district_id
    `;


    const [dataResult, countResult] = await Promise.all([
      db.query<LabReportRow>(
        `SELECT lr.*,
                u.firstname AS submitted_firstname,
                u.lastname  AS submitted_lastname,
                r.region_name,
                d.district_name
         ${joins}
         ${whereSQL}
         ORDER BY lr.id DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*) AS total ${joins} ${whereSQL}`,
        params
      ),
    ]);


    const baseUrl    = `${req.protocol}://${req.get("host")}`;
    const labReports = dataResult.rows.map(row => {
      const images = Array.isArray(row.lab_result_images)
        ? row.lab_result_images.map(img =>
            `${baseUrl}/${img.replace(/\\/g, "/").replace(/^\/+/, "")}`)
        : [];

      return {
        ...row,
        full_name: row.submitted_firstname && row.submitted_lastname
          ? `${decrypt(row.submitted_firstname)} ${decrypt(row.submitted_lastname)}`
          : null,
        submitted_firstname: undefined,
        submitted_lastname:  undefined,
        lab_result_images:   images,
      };
    });

    const total = parseInt(countResult.rows[0].total);


    await audit({
      userId,
      action:    "VIEW",
      resource:  "LAB_REPORT",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
      metadata:  {
        count:   labReports.length,
        page,
        filters: { region_id, district_id, result_type, date_lab_received, search },
      },
    });

    res.json({
      success:       true,
      role,
      page,
      limit,
      total_records: total,
      total_pages:   Math.ceil(total / limit),
      data:          labReports,
    });

  } catch (error) {
    logger.error("getLabReports error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to fetch laboratory reports" });
  }
};