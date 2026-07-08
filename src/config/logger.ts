import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const LOG_DIR = path.join(__dirname, "../../logs");

const { combine, timestamp, printf, colorize, errors } = winston.format;

const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `[${timestamp}] ${level}: ${message}`;
    if (Object.keys(meta).length) log += ` ${JSON.stringify(meta)}`;
    if (stack) log += `\n${stack}`;
    return log;
  })
);

const infoTransport = new DailyRotateFile({
  dirname:       LOG_DIR,
  filename:      "app-%DATE%.log",
  datePattern:   "YYYY-MM-DD",
  zippedArchive: true,
  maxSize:       "20m",
  maxFiles:      "14d",
  level:         "info",
});

const errorTransport = new DailyRotateFile({
  dirname:       LOG_DIR,
  filename:      "error-%DATE%.log",
  datePattern:   "YYYY-MM-DD",
  zippedArchive: true,
  maxSize:       "20m",
  maxFiles:      "30d",
  level:         "error",
});

const logger = winston.createLogger({
  level:       process.env.NODE_ENV === "production" ? "info" : "debug",
  format:      fileFormat,
  transports:  [infoTransport, errorTransport],
  exitOnError: false,
});

if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({ format: consoleFormat }));
}

export default logger;