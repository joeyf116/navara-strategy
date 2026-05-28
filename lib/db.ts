import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const databaseCaCert = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");

let pool: Pool | null = null;

export function getPool() {
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    const ssl =
      process.env.NODE_ENV === "production"
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
            ...(databaseCaCert ? { ca: databaseCaCert } : {}),
          }
        : false;

    pool = new Pool({
      connectionString,
      ssl,
    });
  }

  return pool;
}
