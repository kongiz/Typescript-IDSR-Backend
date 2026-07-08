import express, { Request, Response, ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";

import sanitize from "./middleware/sanitize.middleware";
import logger from "./config/logger";
import { globalLimiter } from "./middleware/rateLimiter.middleware";
import requestLogger from "./middleware/requestLogger.middleware";
import httpsEnforce from "./middleware/httpsEnforce.middleware";
import { verifyToken } from "./middleware/auth.middleware";
import { serveProtectedUpload } from "./middleware/protectedUploads.middleware";

import "./config/db";

import { startReminderJob } from "./jobs/reminderJob";


import signupRoutes from "./routes/signup.routes";
import adminRegisterRoutes from "./routes/adminRegister.routes";
import loginRoutes from "./routes/login.routes";
import authRoutes from "./routes/auth.routes";

// Admin Users
import adminUserRoutes from "./routes/admin_user.routes";

// Location
import healthFacilitiesRoutes from "./routes/get_healthFacilities.routes";
import healthRegionsRoutes from "./routes/get_healthRegions.routes";
import healthDistrictsByRegionRoutes from "./routes/get_healthDistricts_by_region.routes";

// Profile & Notifications
import profileRoutes from "./routes/profile.routes";
import notificationsRoutes from "./routes/notifications.routes";
import fcmRoutes from "./routes/fcm.routes";

// Reports
import surveillanceRoutes from "./routes/surveillance.routes";
import labReportRoutes from "./routes/labReport.routes";
import annex2FImmediateReportRoutes from "./routes/annex2FImmediateReport.routes";
import annex2GLabSpecimenRoutes from "./routes/annex2GLabSpecimen.routes";
import reportsCountRoutes from "./routes/reports_count.routes";
import analyticsRoutes from "./routes/analytics.routes";
import mapRoutes from "./routes/map.routes";

// Start background jobs
startReminderJob();

// Load allowed origins from environment variable
const allowedOrigins: string[] = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();

app.set("trust proxy", 1);

// Enforce HTTPS in production
app.use(httpsEnforce);

// Security headers with Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

// CORS configuration with dynamic origin checking
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS blocked request", { origin });
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Body parser with size limit and sanitization
app.use(express.json({ limit: "10mb" }));
app.use(sanitize);

app.use(globalLimiter);

app.use(requestLogger);

// Serve protected uploads with authentication
app.use("/uploads", verifyToken, serveProtectedUpload);

// Auth & Users
app.use("/api/v1", signupRoutes);
app.use("/api/v1", adminRegisterRoutes);
app.use("/api/v1", loginRoutes);
app.use("/api/v1/auth", authRoutes);

// Admin Users
app.use("/api/v1", adminUserRoutes);

// Location
app.use("/api/v1", healthFacilitiesRoutes);
app.use("/api/v1", healthRegionsRoutes);
app.use("/api/v1", healthDistrictsByRegionRoutes);

// Profile & Notifications
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1", fcmRoutes);

// Reports
app.use("/api/v1", surveillanceRoutes);
app.use("/api/v1", labReportRoutes);
app.use("/api/v1", annex2FImmediateReportRoutes);
app.use("/api/v1", annex2GLabSpecimenRoutes);
app.use("/api/v1", reportsCountRoutes);
app.use("/api/v1", analyticsRoutes);
app.use("/api/v1", mapRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error("Unhandled Error:", { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
  });
};

app.use(errorHandler);

export default app;