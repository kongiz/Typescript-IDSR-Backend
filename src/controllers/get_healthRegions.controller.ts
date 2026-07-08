import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";

interface HealthRegionRow {
  region_id:   number;
  region_name: string;
}

export const getHealthRegions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.query<HealthRegionRow>(
      `SELECT region_id, region_name FROM health_regions ORDER BY region_name ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("getHealthRegions error", { error: (error as Error).message });
    res.status(500).json({ success: false, message: "Query failed" });
  }
};