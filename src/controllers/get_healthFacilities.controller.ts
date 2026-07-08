import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";

interface HealthFacilityRow {
  facility_id:   number;
  facility_name: string;
  district_id:   number;
}

export const getHealthFacilities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { district_id } = req.query as { district_id?: string };

    if (!district_id) {
      res.status(400).json({ success: false, message: "district_id is required" });
      return;
    }

    if (isNaN(Number(district_id))) {
      res.status(400).json({ success: false, message: "district_id must be a valid number" });
      return;
    }

    const result = await db.query<HealthFacilityRow>(
      `SELECT facility_id, facility_name, district_id
       FROM health_facilities
       WHERE district_id = $1
       ORDER BY facility_name ASC`,
      [parseInt(district_id)]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("getHealthFacilities error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};