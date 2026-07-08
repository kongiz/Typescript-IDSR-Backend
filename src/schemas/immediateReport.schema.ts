import { z } from "zod";


const optionalString = z.string().optional()
  .transform(v => (!v || v.trim() === "") ? undefined : v);

const optionalDate = z.string().optional()
  .transform(v => (!v || v.trim() === "") ? undefined : v)
  .refine(d => !d || !isNaN(new Date(d).getTime()), "Invalid date");


export const immediateReportSchema = z.object({

  // Required
  disease:              z.string().min(1, "Disease is required"),
  district:             z.union([z.string(), z.number()]).transform(Number),
  site:                 z.string().min(1, "Site is required"),
  gender:               z.enum(["Male", "Female"], {
                          error: () => ({ message: "Gender must be Male or Female" }),
                        }),
  dateSeen:             z.string().min(1, "Date seen is required")
                          .refine(d => !isNaN(new Date(d).getTime()), "Invalid date seen"),
  dateFacilityNotified: z.string().min(1, "Date facility notified is required")
                          .refine(d => !isNaN(new Date(d).getTime()), "Invalid date facility notified"),
  reporterName:         z.string().min(1, "Reporter name is required"),

  // Optional strings
  recordId:            optionalString,
  country:             optionalString,
  province:            optionalString,
  inpatientOutpatient: optionalString,
  caseGeo:             optionalString,
  patientName:         optionalString,
  address:             optionalString,
  districtAnnex2:      optionalString,
  urbanRural:          optionalString,
  occupation:          optionalString,
  travelHistory:       optionalString,
  destination:         optionalString,
  labResults:          optionalString,
  outcome:             optionalString,
  classification:      optionalString,
  reportingSiteName:   optionalString,
  patientType:         optionalString,
  area:                optionalString,

  // Optional dates
  dateOfBirth:      optionalDate,
  dateOfOnset:      optionalDate,
  dateLastVaccine:  optionalDate,
  dateSpecimen:     optionalDate,
  dateLab:          optionalDate,
  dateSentDistrict: optionalDate,

  // Optional special fields
  phoneNumber: z.string().optional()
    .transform(v => (!v || v.trim() === "") ? undefined : v)
    .refine(v => !v || /^[0-9+]{7,15}$/.test(v), "Invalid phone number format"),

  age: z.union([z.string(), z.number()]).optional()
    .transform(v => (v === undefined || v === "") ? null : Number(v))
    .refine(v => v === null || !isNaN(v as number), "Age must be numeric"),

  vaccineDoses: z.union([z.string(), z.number()]).optional()
    .transform(v => (v === undefined || v === "") ? null : v),

}).refine(data => {
  const onset    = data.dateOfOnset          ? new Date(data.dateOfOnset)          : null;
  const seen     = data.dateSeen             ? new Date(data.dateSeen)             : null;
  const notified = data.dateFacilityNotified ? new Date(data.dateFacilityNotified) : null;
  const sent     = data.dateSentDistrict     ? new Date(data.dateSentDistrict)     : null;

  if (onset && seen && onset > seen)       return false;
  if (seen && notified && seen > notified) return false;
  if (notified && sent && notified > sent) return false;
  return true;
}, {
  message: "Date sequence is invalid: onset → seen → facility notified → sent to district",
});

export type ImmediateReportInput = z.infer<typeof immediateReportSchema>;