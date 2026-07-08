import db     from "../config/db";
import logger from "../config/logger";


type AuditAction   = "VIEW" | "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "LOGIN" | "LOGOUT";
type AuditResource = "LAB_REPORT" | "SURVEILLANCE_REPORT" | "SPECIMEN_REPORT" | "IMMEDIATE_REPORT" | "USER_PROFILE" | "AUTH";

interface AuditParams {
  userId:      number;
  action:      AuditAction;
  resource:    AuditResource;
  resourceId?: number | null;
  ipAddress?:  string | null;
  userAgent?:  string | null;
  metadata?:   Record<string, unknown> | null;
}


export const audit = async ({
  userId,
  action,
  resource,
  resourceId = null,
  ipAddress  = null,
  userAgent  = null,
  metadata   = null,
}: AuditParams): Promise<void> => {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (user_id, action, resource, resource_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action,
        resource,
        resourceId,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    logger.error("Audit log failed", {
      error:    (err as Error).message,
      userId,
      action,
      resource,
    });
  }
};