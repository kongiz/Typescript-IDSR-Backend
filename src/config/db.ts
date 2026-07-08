import { Pool, type QueryResult } from "pg";
import env from "./env";

const pool = new Pool({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  port: parseInt(env.DB_PORT, 10),
  max: 10,
});

pool
  .query("SELECT NOW()")
  .then((res: QueryResult) => {
    console.log("PostgreSQL Connected:", res.rows[0]);
  })
  .catch((err: Error) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });

pool.on("error", (err: Error) => {
  console.error("Unexpected database error:", err);
});

export default pool;