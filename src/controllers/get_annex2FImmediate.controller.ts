import { Request, Response }      from "express";
import db                         from "../config/db";
import logger                     from "../config/logger";
import { decrypt, hashForLookup } from "../utils/encryption";
import { audit }                  from "../services/audit.service";


interface ImmediateReportRow {
  id:                  number;
  submitted_firstname: string | null | undefined;
  submitted_lastname:  string | null | undefined;
  [key: string]:       unknown;
}

interface QueryParams {
  page?:           string;
  limit?:          string;
  region_id?:      string;
  district_id?:    string;
  search?:         string;
  outcome?:        string;
  classification?: string;
  date_of_onset?:  string;
}


export const getImmediateReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const {
      page: pageStr, limit: limitStr,
      region_id, district_id,
      search, outcome, classification, date_of_onset,
    } = req.query as QueryParams;

    const page   = Math.max(1, parseInt(pageStr  ?? "1"));
    const limit  = Math.min(100, parseInt(limitStr ?? "20"));
    const offset = (page - 1) * limit;


    const whereClauses: string[]  = [];
    const params:       unknown[] = [];
    let   paramIndex = 1;

    if (user.role === "Regional Officer") {
      whereClauses.push(`hd.region_id = $${paramIndex++}`);
      params.push(user.region_id);
    } else if (user.role === "District Officer") {
      whereClauses.push(`ar.district_id = $${paramIndex++}`);
      params.push(user.district_id);
    } else if (user.role !== "Admin") {
      whereClauses.push(`ar.user_id = $${paramIndex++}`);
      params.push(user.id);
    }

    if (region_id) {
      whereClauses.push(`hd.region_id = $${paramIndex++}`);
      params.push(parseInt(region_id));
    }
    if (district_id) {
      whereClauses.push(`ar.district_id = $${paramIndex++}`);
      params.push(parseInt(district_id));
    }
    if (outcome) {
      whereClauses.push(`ar.outcome = $${paramIndex++}`);
      params.push(outcome);
    }
    if (classification) {
      whereClauses.push(`ar.classification = $${paramIndex++}`);
      params.push(classification);
    }
    if (date_of_onset) {
      whereClauses.push(`ar.date_of_onset >= $${paramIndex++}`);
      params.push(date_of_onset);
    }
    if (search) {
      const searchHash = hashForLookup(search);
      whereClauses.push(`(
        ar.disease             ILIKE $${paramIndex}     OR
        ar.reporting_site_name ILIKE $${paramIndex}     OR
        ar.reporter_name       ILIKE $${paramIndex}     OR
        ar.patient_name        ILIKE $${paramIndex}     OR
        u.firstname_hash       =     $${paramIndex + 1} OR
        u.lastname_hash        =     $${paramIndex + 1}
      )`);
      params.push(`%${search}%`, searchHash);
      paramIndex += 2;
    }

    const whereSQL     = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const filterParams = [...params];

    const joins = `
      FROM annex2f_immediate_case_reports ar
      LEFT JOIN users           u  ON ar.user_id     = u.id
      LEFT JOIN health_district hd ON ar.district_id = hd.district_id
      LEFT JOIN health_regions  hr ON hd.region_id   = hr.region_id
    `;


    const [result, countResult] = await Promise.all([
      db.query<ImmediateReportRow>(
        `SELECT
          ar.id, ar.user_id, ar.region_id, ar.district_id, ar.facility_id,
          ar.reporting_site_name, ar.disease, ar.patient_type,
          ar.date_seen, ar.patient_name, ar.date_of_birth, ar.age,
          ar.gender, ar.address, ar.area, ar.phone_number, ar.occupation,
          ar.date_of_onset, ar.travel_history, ar.destination,
          ar.vaccine_doses, ar.date_last_vaccine, ar.date_specimen,
          ar.date_lab, ar.lab_results, ar.outcome, ar.classification,
          ar.date_facility_notified, ar.date_sent_district,
          ar.reporter_name, ar.created_at,
          u.firstname AS submitted_firstname,
          u.lastname  AS submitted_lastname,
          hr.region_name,
          hd.district_name
         ${joins}
         ${whereSQL}
         ORDER BY ar.id DESC
         LIMIT  $${paramIndex++}
         OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      ),
      db.query<{ c: string }>(
        `SELECT COUNT(*) AS c ${joins} ${whereSQL}`,
        filterParams
      ),
    ]);

    const total = parseInt(countResult.rows[0].c);

    // Decrypt submitted_by names and remove the original encrypted fields

    const data = result.rows.map(row => ({
      ...row,
      submitted_by:        row.submitted_firstname && row.submitted_lastname
        ? `${decrypt(row.submitted_firstname)} ${decrypt(row.submitted_lastname)}`
        : null,
      submitted_firstname: undefined,
      submitted_lastname:  undefined,
    }));


    await audit({
      userId:    user.id,
      action:    "VIEW",
      resource:  "IMMEDIATE_REPORT",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
      metadata:  {
        count:   data.length,
        page,
        filters: { region_id, district_id, outcome, classification, date_of_onset, search },
      },
    });

    res.json({
      success:       true,
      role:          user.role,
      page,
      limit,
      total_records: total,
      total_pages:   Math.ceil(total / limit),
      data,
    });

  } catch (error) {
    logger.error("getImmediateReports error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to fetch immediate reports" });
  }
};