import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";
import { decrypt, hashForLookup } from "../utils/encryption";
import { audit }                  from "../services/audit.service";


interface SurveillanceReportRow {
  id:                  number;
  submitted_firstname: string | null | undefined;
  submitted_lastname:  string | null | undefined;
  diseases?:           DiseaseRow[];
  [key: string]:       unknown;
}

interface DiseaseRow {
  report_id:              number;
  disease_name:           string;
  u5_male_alive:          number;
  u5_female_alive:        number;
  a5_male_alive:          number;
  a5_female_alive:        number;
  u5_male_dead:           number;
  u5_female_dead:         number;
  a5_male_dead:           number;
  a5_female_dead:         number;
  total_sample_collected: number | null;
}

interface QueryParams {
  page?:        string;
  limit?:       string;
  region_id?:   string;
  district_id?: string;
  search?:      string;
  start_date?:  string;
  end_date?:    string;
  epiweek?:     string;
}

export const getSurveillanceReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const {
      page: pageStr, limit: limitStr,
      region_id, district_id,
      search, start_date, end_date, epiweek,
    } = req.query as QueryParams;

    const page   = Math.max(1, parseInt(pageStr  ?? "1"));
    const limit  = Math.min(100, parseInt(limitStr ?? "20"));
    const offset = (page - 1) * limit;

    const whereClauses: string[]  = [];
    const params:       unknown[] = [];
    let   paramIndex = 1;

    if (user.role === "Regional Officer") {
      whereClauses.push(`sr.region_id = $${paramIndex++}`);
      params.push(user.region_id);
    } else if (user.role === "District Officer") {
      whereClauses.push(`sr.district_id = $${paramIndex++}`);
      params.push(user.district_id);
    } else if (user.role !== "Admin") {
      whereClauses.push(`sr.user_id = $${paramIndex++}`);
      params.push(user.id);
    }

    // Apply filters from query parameters

    if (region_id) {
      whereClauses.push(`sr.region_id = $${paramIndex++}`);
      params.push(parseInt(region_id));
    }
    if (district_id) {
      whereClauses.push(`sr.district_id = $${paramIndex++}`);
      params.push(parseInt(district_id));
    }
    if (start_date) {
      whereClauses.push(`sr.created_at >= $${paramIndex++}`);
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push(`sr.created_at <= $${paramIndex++}`);
      params.push(end_date);
    }
    if (epiweek) {
      whereClauses.push(`sr.epiweek = $${paramIndex++}`);
      params.push(epiweek);
    }
    if (search) {
      const searchHash = hashForLookup(search);
      whereClauses.push(`(
        r.region_name    ILIKE $${paramIndex}     OR
        d.district_name  ILIKE $${paramIndex}     OR
        sr.epiweek       ILIKE $${paramIndex}     OR
        f.facility_name  ILIKE $${paramIndex}     OR
        u.firstname_hash =     $${paramIndex + 1} OR
        u.lastname_hash  =     $${paramIndex + 1}
      )`);
      params.push(`%${search}%`, searchHash);
      paramIndex += 2;
    }

    const whereSQL     = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const filterParams = [...params];

    const joins = `
      FROM surveillance_reports sr
      LEFT JOIN health_regions    r ON sr.region_id   = r.region_id
      LEFT JOIN health_district   d ON sr.district_id = d.district_id
      LEFT JOIN health_facilities f ON sr.facility_id = f.facility_id
      LEFT JOIN users             u ON sr.user_id     = u.id
    `;

    const dataQuery = `
      SELECT
        sr.*,
        r.region_name,
        d.district_name,
        f.facility_name,
        u.firstname AS submitted_firstname,
        u.lastname  AS submitted_lastname
      ${joins}
      ${whereSQL}
      ORDER BY sr.id DESC
      LIMIT  $${paramIndex++}
      OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const countQuery = `SELECT COUNT(*) AS c ${joins} ${whereSQL}`;

    const [reportResult, countResult] = await Promise.all([
      db.query<SurveillanceReportRow>(dataQuery, params),
      db.query<{ c: string }>(countQuery, filterParams),
    ]);


    const reports: SurveillanceReportRow[] = reportResult.rows.map(row => ({
      ...row,
      submitted_by: row.submitted_firstname && row.submitted_lastname
        ? `${decrypt(row.submitted_firstname)} ${decrypt(row.submitted_lastname)}`
        : null,
      submitted_firstname: undefined,
      submitted_lastname:  undefined,
    }));

    const total = parseInt(countResult.rows[0].c);


    if (reports.length > 0) {
      const reportIds     = reports.map(r => r.id);
      const diseaseResult = await db.query<DiseaseRow>(
        `SELECT * FROM surveillance_diseases WHERE report_id = ANY($1)`,
        [reportIds]
      );

      const diseaseMap = new Map<number, SurveillanceReportRow["diseases"]>();

      for (const d of diseaseResult.rows) {
        const under5_male   = (d.u5_male_alive   ?? 0) + (d.u5_male_dead   ?? 0);
        const under5_female = (d.u5_female_alive ?? 0) + (d.u5_female_dead ?? 0);
        const above5_male   = (d.a5_male_alive   ?? 0) + (d.a5_male_dead   ?? 0);
        const above5_female = (d.a5_female_alive ?? 0) + (d.a5_female_dead ?? 0);
        const computedTotal = under5_male + under5_female + above5_male + above5_female;

        if (!diseaseMap.has(d.report_id)) diseaseMap.set(d.report_id, []);
        diseaseMap.get(d.report_id)!.push({
          ...d,
          under5_male,
          under5_female,
          above5_male,
          above5_female,
          total: d.total_sample_collected ?? computedTotal,
        } as unknown as DiseaseRow);
      }

      for (const report of reports) {
        report.diseases = diseaseMap.get(report.id) ?? [];
      }
    }

    await audit({
      userId:    user.id,
      action:    "VIEW",
      resource:  "SURVEILLANCE_REPORT",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
      metadata:  {
        count:   reports.length,
        page,
        filters: { region_id, district_id, search, start_date, end_date, epiweek },
      },
    });

    res.json({
      success:       true,
      role:          user.role,
      page,
      limit,
      total_records: total,
      total_pages:   Math.ceil(total / limit),
      data:          reports,
    });

  } catch (error) {
    logger.error("getSurveillanceReports error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to fetch surveillance reports" });
  }
};