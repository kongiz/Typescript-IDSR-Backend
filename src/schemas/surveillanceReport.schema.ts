import { z } from "zod";


const toInt = z.union([z.string(), z.number()])
  .transform(Number)
  .refine(Number.isInteger, "Must be an integer");

const toNum = (def = 0) =>
  z.union([z.string(), z.number()])
    .optional()
    .default(def)
    .transform(Number);



export const surveillanceReportSchema = z.object({

  // IDs
  region_id:   toInt.optional(),
  district_id: toInt.optional(),
  facility_id: toInt.optional(),
  regionId:    toInt.optional(),
  districtId:  toInt.optional(),
  facilityId:  toInt.optional(),

  // Required
  dateFrom:    z.string().min(1, "Date from is required")
                 .refine(d => !isNaN(new Date(d).getTime()), "Invalid date from"),
  dateTo:      z.string().min(1, "Date to is required")
                 .refine(d => !isNaN(new Date(d).getTime()), "Invalid date to"),
  officerName: z.string().min(1, "Officer name is required"),
  designation: z.string().min(1, "Designation is required"),

  // Optional strings
  epiweek:        z.string().optional(),
  facilityGeo:    z.string().optional(),
  officerComment: z.string().optional().default(""),
  healthFacility: z.string().optional(),
  healthRegion:   z.string().optional(),
  district:       z.string().optional(),

  // Totals
  totConU5Male:   toNum(0),
  totConU5Female: toNum(0),
  totConA5Male:   toNum(0),
  totConA5Female: toNum(0),
  grandTotal:     toNum(0),

  // Disease rows
  updatedDiseases: z.array(z.object({
    name:          z.string().min(1),
    isExpanded:    z.boolean().optional(),
    u5MaleAlive:   toNum(0),
    u5FemaleAlive: toNum(0),
    a5MaleAlive:   toNum(0),
    a5FemaleAlive: toNum(0),
    u5MaleDeath:   toNum(0),
    u5FemaleDeath: toNum(0),
    a5MaleDeath:   toNum(0),
    a5FemaleDeath: toNum(0),
    totalSamples:  toNum(0),
  })).optional().default([]),

}).refine(data => {
  const from = new Date(data.dateFrom);
  const to   = new Date(data.dateTo);
  return from <= to;
}, {
  message: "dateFrom cannot be after dateTo",
});

export type SurveillanceReportInput = z.infer<typeof surveillanceReportSchema>;