import "dotenv/config";

import "./config/env";

import type { Server } from "http";
import app from "./app";

const PORT: number = process.env.PORT ? Number(process.env.PORT) : 5000;

let server: Server | undefined;

const shutdown = (code = 0): void => {
  console.log("Shutting down server...");

  if (!server) {
    process.exit(code);
    return;
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(code);
  });

  setTimeout(() => {
    console.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  shutdown(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  shutdown(1);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  shutdown(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received");
  shutdown(0);
});

server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
  } else if (error.code === "EACCES") {
    console.error(`Permission denied to bind to port ${PORT}.`);
  } else {
    console.error("Server failed to start:", error);
  }
  process.exit(1);
});