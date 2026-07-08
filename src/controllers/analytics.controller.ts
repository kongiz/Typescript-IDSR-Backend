import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";
import { JwtDecoded } from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

interface UserRow {
  role:        Role;
  region_id:   number | null;
  district_id: number | null;
}

interface FilterResult {
  where:  string;
  params: unknown[];
}

interface TotalsMap {
  surveillance: number;
  immediate:    number;
  lab:          number;
  specimen:     number;
}


export const getAnalysisReport = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();

  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const userResult = await client.query<UserRow>(
      `SELECT role, region_id, district_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const { role, region_id, district_id } = userResult.rows[0];


    const buildFilter = (alias = "r."): FilterResult => {
      const params: unknown[] = [];
      let where = "";

      if (role === "Regional Officer") {
        where = `WHERE ${alias}region_id = $1`;
        params.push(region_id);
      } else if (role === "District Officer") {
        where = `WHERE ${alias}district_id = $1`;
        params.push(district_id);
      } else if (role !== "Admin") {
        where = `WHERE ${alias}user_id = $1`;
        params.push(userId);
      }

      return { where, params };
    };

    const buildJoinFilter = (userAlias = "u."): FilterResult => {
      const params: unknown[] = [];
      let where = "";

      if (role === "Regional Officer") {
        where = `WHERE ${userAlias}region_id = $1`;
        params.push(region_id);
      } else if (role === "District Officer") {
        where = `WHERE ${userAlias}district_id = $1`;
        params.push(district_id);
      } else if (role !== "Admin") {
        where = `WHERE r.user_id = $1`;
        params.push(userId);
      }

      return { where, params };
    };


    const tables: Record<keyof TotalsMap, string> = {
      surveillance: "surveillance_reports",
      immediate:    "annex2f_immediate_case_reports",
      lab:          "laboratory_reports",
      specimen:     "laboratory_report_form_with_specimen",
    };

    const totals = {} as TotalsMap;

    for (const [key, table] of Object.entries(tables) as [keyof TotalsMap, string][]) {
      if (role === "Admin") {
        const result = await client.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM ${table}`
        );
        totals[key] = parseInt(result.rows[0].c);
      } else {
        const isJoin = table !== "surveillance_reports";
        const sql    = isJoin
          ? `SELECT COUNT(*) AS c FROM ${table} r JOIN users u ON r.user_id = u.id`
          : `SELECT COUNT(*) AS c FROM ${table} r`;

        const { where, params } = isJoin
          ? buildJoinFilter("u.")
          : buildFilter("r.");

        const result = await client.query<{ c: string }>(`${sql} ${where}`, params);
        totals[key]  = parseInt(result.rows[0].c);
      }
    }


    const { where: trendWhere, params: trendParams } = buildFilter("r.");
    const trendResult = await client.query<{ epiweek: string; total: string }>(
      `SELECT epiweek, COUNT(*) AS total
       FROM surveillance_reports r
       ${trendWhere}
       GROUP BY epiweek
       ORDER BY epiweek DESC
       LIMIT 6`,
      trendParams
    );


    const { where: disWhere, params: disParams } = buildFilter("r.");
    const diseasesResult = await client.query<{ disease_name: string; total: string }>(
      `SELECT d.disease_name,
              SUM(
                u5_male_alive + u5_female_alive +
                a5_male_alive + a5_female_alive
              ) AS total
       FROM surveillance_diseases d
       JOIN surveillance_reports r ON r.id = d.report_id
       ${disWhere}
       GROUP BY d.disease_name
       ORDER BY total DESC
       LIMIT 5`,
      disParams
    );

    const { where: gWhere, params: gParams } = buildFilter("r.");
    const genderResult = await client.query<{ male: string; female: string }>(
      `SELECT
         SUM(a5_male_alive   + u5_male_alive)   AS male,
         SUM(a5_female_alive + u5_female_alive) AS female
       FROM surveillance_diseases d
       JOIN surveillance_reports r ON r.id = d.report_id
       ${gWhere}`,
      gParams
    );

    

    let ageSql = `
      SELECT
        SUM(CASE WHEN age <= 5              THEN 1 ELSE 0 END) AS u5,
        SUM(CASE WHEN age BETWEEN 6  AND 15 THEN 1 ELSE 0 END) AS g6_15,
        SUM(CASE WHEN age BETWEEN 16 AND 30 THEN 1 ELSE 0 END) AS g16_30,
        SUM(CASE WHEN age BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS g31_60,
        SUM(CASE WHEN age > 60              THEN 1 ELSE 0 END) AS above60
      FROM annex2f_immediate_case_reports r
    `;
    const ageParams: unknown[] = [];

    if (role === "Regional Officer") {
      ageSql += ` JOIN users u ON u.id = r.user_id WHERE u.region_id = $1`;
      ageParams.push(region_id);
    } else if (role === "District Officer") {
      ageSql += ` JOIN users u ON u.id = r.user_id WHERE u.district_id = $1`;
      ageParams.push(district_id);
    } else if (role !== "Admin") {
      ageSql += ` WHERE r.user_id = $1`;
      ageParams.push(userId);
    }

    const ageResult = await client.query(ageSql, ageParams);


    const { where: facWhere, params: facParams } = buildFilter("r.");
    const facilitiesResult = await client.query<{ facility_name: string; total: string }>(
      `SELECT hf.facility_name, COUNT(*) AS total
       FROM surveillance_reports r
       JOIN health_facilities hf ON hf.facility_id = r.facility_id
       ${facWhere}
       GROUP BY hf.facility_name
       ORDER BY total DESC
       LIMIT 5`,
      facParams
    );


    let labSql = `
      SELECT ROUND(
        AVG(
          EXTRACT(DAY FROM (
            date_district_received_lab_result::timestamp -
            date_lab_received::timestamp
          ))
        )
      ) AS avg_delay
      FROM laboratory_reports r
    `;
    const labParams: unknown[] = [];

    if (role === "Regional Officer") {
      labSql += ` JOIN users u ON u.id = r.user_id WHERE u.region_id = $1`;
      labParams.push(region_id);
    } else if (role === "District Officer") {
      labSql += ` JOIN users u ON u.id = r.user_id WHERE u.district_id = $1`;
      labParams.push(district_id);
    } else if (role !== "Admin") {
      labSql += ` WHERE r.user_id = $1`;
      labParams.push(userId);
    }

    const labTurnaroundResult = await client.query<{ avg_delay: string }>(labSql, labParams);


    res.json({
      success: true,
      data: {
        totals: {
          surveillance: totals.surveillance,
          immediate:    totals.immediate,
          lab:          totals.lab,
          specimen:     totals.specimen,
        },
        weekly_trend:        trendResult.rows.reverse(),
        top_diseases:        diseasesResult.rows,
        gender_distribution: genderResult.rows[0]        ?? { male: 0, female: 0 },
        age_groups:          ageResult.rows[0]           ?? {},
        top_facilities:      facilitiesResult.rows,
        lab_turnaround:      labTurnaroundResult.rows[0] ?? { avg_delay: 0 },
      },
    });

  } catch (error) {
    logger.error("getAnalysisReport error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to generate analysis report" });

  } finally {
    client.release();
  }
};