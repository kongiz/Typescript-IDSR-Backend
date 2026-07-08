import { Router }              from "express";
import { submitSpecimenReport } from "../controllers/annex2GLabSpecimen.controller";
import { getSpecimenReports }   from "../controllers/get_annex2GLabSpecimen.controller";
import { editSpecimenReport }   from "../controllers/edit_annex2GSpecimen.controller";
import verifyToken              from "../middleware/auth.middleware";
import { generalLimiter, reportSubmitLimiter } from "../middleware/rateLimiter.middleware";
import { blockRole }            from "../middleware/roleGuard.middleware";

const router = Router();

router.post(
  "/submit_annex2GLabSpecimen",
  reportSubmitLimiter,
  verifyToken,
  blockRole("Admin"),
  submitSpecimenReport
);

router.get(
  "/get_annex2GLabSpecimen",
  generalLimiter,
  verifyToken,
  getSpecimenReports
);

router.put(
  "/edit_annex2GLabSpecimen/:id",
  generalLimiter,
  verifyToken,
  editSpecimenReport
);

export default router;