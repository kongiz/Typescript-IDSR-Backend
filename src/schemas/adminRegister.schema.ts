import { z } from "zod";

const ALLOWED_ROLES = ["Admin", "Regional Officer", "District Officer"] as const;

export const adminRegisterSchema = z.object({
  firstname:   z.string().min(1, "First name is required"),
  lastname:    z.string().min(1, "Last name is required"),
  email:       z.string().email("Invalid email format"),
  password:    z.string()
                 .min(8,                "Password must be at least 8 characters")
                 .regex(/[A-Z]/,        "Password must contain at least one uppercase letter")
                 .regex(/[a-z]/,        "Password must contain at least one lowercase letter")
                 .regex(/[0-9]/,        "Password must contain at least one number")
                 .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  role:        z.string()
                 .min(1, "Role is required")
                 .transform(r => r.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()))
                 .refine(r => (ALLOWED_ROLES as readonly string[]).includes(r), {
                   message: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(", ")}`,
                 }),

  // Optional
  phone:       z.string().regex(/^[0-9]{7,10}$/, "Phone number must be 7-10 digits").optional(),
  gender:      z.enum(["Male", "Female", "Other"], {
                 error: () => ({ message: "Gender must be Male, Female, or Other" }),
               }).optional(),
  region_id:   z.union([z.string(), z.number()])
                 .optional()
                 .transform(v => (v !== undefined && v !== null) ? Number(v) : null),
  district_id: z.union([z.string(), z.number()])
                 .optional()
                 .transform(v => (v !== undefined && v !== null) ? Number(v) : null),
});

export type AdminRegisterInput = z.infer<typeof adminRegisterSchema>;