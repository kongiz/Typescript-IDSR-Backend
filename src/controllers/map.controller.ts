import { Request, Response } from "express";
import db     from "../config/db";
import logger from "../config/logger";
import { JwtDecoded } from "../types/jwt";


type Role = JwtDecoded["data"]["role"];

interface SurveillanceMapRow {
  id:            number;
  geo:           string | null;
  label:         string | null;
  facility_name: string | null;
  region_name:   string | null;
  district_name: string | null;
  epiweek:       string | null;
  date_from:     string | null;
  date_to:       string | null;
  type:          "SURVEILLANCE";
}

interface AnnexMapRow {
  id:            number;
  geo:           string | null;
  label:         string | null;
  patient_name:  string | null;
  outcome:       string | null;
  gender:        string | null;
  age:           number | null;
  region_name:   string | null;
  district_name: string | null;
  date_seen:     string | null;
  type:          "ANNEX2F";
}

interface GeoCoords {
  lat: number;
  lng: number;
}


function parseGeo(geoStr: string | null): GeoCoords | null {
  if (!geoStr) return null;
  const parts = geoStr.split(",").map(s => parseFloat(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { lat: parts[0], lng: parts[1] };
}


export const getMapPoints = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }


    let surveillanceWhere = "WHERE sr.facility_geo IS NOT NULL AND sr.facility_geo != ''";
    let annexWhere        = "WHERE a.caseGeo IS NOT NULL AND a.caseGeo != ''";

    const surveillanceParams: unknown[] = [];
    const annexParams:        unknown[] = [];

    const role = user.role as Role;

    switch (role) {
      case "Admin":
        break;

      case "Regional Officer":
        surveillanceWhere += ` AND sr.region_id = $1`;
        annexWhere        += ` AND a.region_id  = $1`;
        surveillanceParams.push(user.region_id);
        annexParams.push(user.region_id);
        break;

      case "District Officer":
        surveillanceWhere += ` AND sr.district_id = $1`;
        annexWhere        += ` AND a.district_id  = $1`;
        surveillanceParams.push(user.district_id);
        annexParams.push(user.district_id);
        break;

      case "Health Officer":
      case "Clinician":
      case "Community Health Worker":
      case "Lab Technician":
        surveillanceWhere += ` AND sr.user_id = $1`;
        annexWhere        += ` AND a.user_id  = $1`;
        surveillanceParams.push(user.id);
        annexParams.push(user.id);
        break;

      default:
        res.json({ success: true, data: { surveillance: [], annex2f: [] } });
        return;
    }

    const [surveillanceResult, annexResult] = await Promise.all([
      db.query<SurveillanceMapRow>(
        `SELECT
          sr.id,
          sr.facility_geo   AS geo,
          f.facility_name   AS label,
          f.facility_name,
          r.region_name,
          d.district_name,
          sr.epiweek,
          sr.date_from,
          sr.date_to,
          'SURVEILLANCE'    AS type
         FROM surveillance_reports sr
         LEFT JOIN health_facilities f ON sr.facility_id = f.facility_id
         LEFT JOIN health_regions    r ON sr.region_id   = r.region_id
         LEFT JOIN health_district   d ON sr.district_id = d.district_id
         ${surveillanceWhere}
         ORDER BY sr.id DESC`,
        surveillanceParams
      ),
      db.query<AnnexMapRow>(
        `SELECT
          a.id,
          a.caseGeo         AS geo,
          a.disease         AS label,
          a.patient_name,
          a.outcome,
          a.gender,
          a.age,
          r.region_name,
          d.district_name,
          a.date_seen,
          'ANNEX2F'         AS type
         FROM annex2f_immediate_case_reports a
         LEFT JOIN health_regions  r ON a.region_id   = r.region_id
         LEFT JOIN health_district d ON a.district_id = d.district_id
         ${annexWhere}
         ORDER BY a.id DESC`,
        annexParams
      ),
    ]);

    const surveillancePoints = surveillanceResult.rows
      .map(row => ({ ...row, coords: parseGeo(row.geo) }))
      .filter((row): row is typeof row & { coords: GeoCoords } => row.coords !== null);

    const annexPoints = annexResult.rows
      .map(row => ({ ...row, coords: parseGeo(row.geo) }))
      .filter((row): row is typeof row & { coords: GeoCoords } => row.coords !== null);

    res.json({
      success: true,
      data: {
        surveillance: surveillancePoints,
        annex2f:      annexPoints,
      },
    });

  } catch (error) {
    logger.error("getMapPoints error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Failed to fetch map points" });
  }
};