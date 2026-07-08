import { z } from "zod";

export const labReportSchema = z.object({
  labName:                       z.string().min(1, "Lab name is required"),
  dateLabReceived:               z.string().min(1, "Date lab received is required")
                                   .refine(d => !isNaN(new Date(d).getTime()), "Invalid date lab received"),
  specimenCondition:             z.string().min(1, "Specimen condition is required"),
  testTypesPerformed:            z.string().min(1, "Test types performed is required"),
  finalLabResult:                z.string().min(1, "Final lab result is required"),
  dateLabSentDistrict:           z.string().min(1, "Date lab sent to district is required")
                                   .refine(d => !isNaN(new Date(d).getTime()), "Invalid date lab sent to district"),
  dateDistrictReceivedLabResult: z.string().min(1, "Date district received result is required")
                                   .refine(d => !isNaN(new Date(d).getTime()), "Invalid date district received result"),

}).refine(data => {
  const received = new Date(data.dateLabReceived);
  const sent     = new Date(data.dateLabSentDistrict);
  return sent >= received;
}, {
  message: "Date lab sent to district cannot be before date lab received",
}).refine(data => {
  const sent             = new Date(data.dateLabSentDistrict);
  const districtReceived = new Date(data.dateDistrictReceivedLabResult);
  return districtReceived >= sent;
}, {
  message: "Date district received result cannot be before date lab sent to district",
});

export type LabReportInput = z.infer<typeof labReportSchema>;