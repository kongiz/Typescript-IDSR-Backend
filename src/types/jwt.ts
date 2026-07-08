import { z } from "zod";

// src/types/jwt.ts
const jwtPayloadSchema = z.object({
  jti:  z.string(),
  data: z.object({
    id:          z.number(),
    role:        z.enum([
      "Admin",
      "Regional Officer",
      "District Officer",
      "Health Officer",
      "Lab Technician",
      "Clinician",
      "Community Health Worker",
    ]),
    region_id:   z.number().optional(),
    district_id: z.number().optional(),
  }),
  iat: z.number(),
  exp: z.number(),
});

export type JwtDecoded = z.infer<typeof jwtPayloadSchema>;
export { jwtPayloadSchema };