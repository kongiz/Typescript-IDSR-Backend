import { z } from "zod";

export const specimenReportSchema = z.object({
  dateSpecimenCollect: z.string().min(1, "Collection date is required")
                         .refine(d => !isNaN(new Date(d).getTime()), "Invalid collection date"),
  suspectedDisease:    z.string().min(1, "Suspected disease is required"),
  specimenType:        z.string().min(1, "Specimen type is required"),

  // Optional fields
  specimenUniqueID:    z.string().optional(),
  patientNameLab:      z.string().optional(),
  sex:                 z.enum(["Male", "Female"], {
                         error: () => ({ message: "Sex must be Male or Female" }),
                       }).optional(),
  age:                 z.union([z.string(), z.number()])
                         .optional()
                         .transform(v => (v !== undefined && v !== "") ? Number(v) : null)
                         .refine(v => v === null || !isNaN(v as number), "Age must be numeric"),
  dateSpecimenSentLab: z.string().optional()
                         .refine(d => !d || !isNaN(new Date(d).getTime()), "Invalid sent date"),
  phoneNumber:         z.string().optional()
                         .refine(v => !v || /^[0-9+]{7,15}$/.test(v), "Invalid phone number format"),
  emailClinician:      z.string().optional()
                         .refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid clinician email format"),

}).refine(data => {
  if (!data.dateSpecimenSentLab) return true;
  const collect = new Date(data.dateSpecimenCollect);
  const sent    = new Date(data.dateSpecimenSentLab);
  return sent >= collect;
}, {
  message: "Specimen sent date cannot be before collection date",
});

export type SpecimenReportInput = z.infer<typeof specimenReportSchema>;