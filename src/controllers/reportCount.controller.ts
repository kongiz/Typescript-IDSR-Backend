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


const ALL_TABLES = [
  "surveillance_reports",
  "annex2f_immediate_case_reports",
  "laboratory_reports",
  "laboratory_report_form_with_specimen",
] as const;

const JOIN_TABLES = [
  "annex2f_immediate_case_reports",
  "laboratory_reports",
  "laboratory_report_form_with_specimen",
] as const;

async function countTable(table: string): Promise<number> {
  const result = await db.query<{ c: string }>(`SELECT COUNT(*) AS c FROM ${table}`);
  return parseInt(result.rows[0].c);
}

async function countTableByUser(table: string, userId: number): Promise<number> {
  const result = await db.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM ${table} WHERE user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].c);
}

async function countTableByJoin(
  table:  string,
  column: "region_id" | "district_id",
  value:  number
): Promise<number> {
  const result = await db.query<{ c: string }>(
    `SELECT COUNT(*) AS c
     FROM ${table} r
     JOIN users u ON r.user_id = u.id
     WHERE u.${column} = $1`,
    [value]
  );
  return parseInt(result.rows[0].c);
}

export const countReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const userResult = await db.query<UserRow>(
      `SELECT role, region_id, district_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const { role, region_id, district_id } = userResult.rows[0];
    let totalReports = 0;

    if (role === "Admin") {
      const counts = await Promise.all(ALL_TABLES.map(t => countTable(t)));
      totalReports = counts.reduce((sum, n) => sum + n, 0);

    } else if (role === "Regional Officer" && region_id) {
      const [survCount, ...joinCounts] = await Promise.all([
        db.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM surveillance_reports WHERE region_id = $1`,
          [region_id]
        ).then(r => parseInt(r.rows[0].c)),
        ...JOIN_TABLES.map(t => countTableByJoin(t, "region_id", region_id)),
      ]);
      totalReports = survCount + joinCounts.reduce((sum, n) => sum + n, 0);

    } else if (role === "District Officer" && district_id) {
      const [survCount, ...joinCounts] = await Promise.all([
        db.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM surveillance_reports WHERE district_id = $1`,
          [district_id]
        ).then(r => parseInt(r.rows[0].c)),
        ...JOIN_TABLES.map(t => countTableByJoin(t, "district_id", district_id)),
      ]);
      totalReports = survCount + joinCounts.reduce((sum, n) => sum + n, 0);

    } else {
      const counts = await Promise.all(ALL_TABLES.map(t => countTableByUser(t, userId)));
      totalReports = counts.reduce((sum, n) => sum + n, 0);
    }

    res.json({ success: true, total_reports: totalReports });

  } catch (error) {
    logger.error("countReports error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to count reports" });
  }
};