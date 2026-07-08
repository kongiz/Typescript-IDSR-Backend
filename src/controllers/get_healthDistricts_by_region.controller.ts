import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";

interface HealthDistrictRow {
  district_id:   number;
  district_name: string;
  region_id:     number;
}

export const getHealthDistricts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { region_id } = req.query as { region_id?: string };

    if (!region_id) {
      res.status(400).json({ success: false, message: "region_id is required" });
      return;
    }

    const result = await db.query<HealthDistrictRow>(
      `SELECT district_id, district_name, region_id
       FROM health_district
       WHERE region_id = $1
       ORDER BY district_name ASC`,
      [parseInt(region_id)]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("getHealthDistricts error", { error: (error as Error).message });
    res.status(500).json({ success: false, message: "Query failed" });
  }
};