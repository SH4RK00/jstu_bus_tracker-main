import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const sqlHost = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;

if (!connectionString && !sqlHost) {
  throw new Error("A Postgres connection string or host must be set in environment variables.");
}
if (!connectionString && !sqlDbName) {
  throw new Error("SQL_DB_NAME, PGDATABASE, or POSTGRES_DB must be set in environment variables.");
}
if (!connectionString && !user) {
  throw new Error("SQL_ADMIN_USER, SQL_USER, PGUSER, or POSTGRES_USER must be set in environment variables.");
}
if (!connectionString && !password) {
  throw new Error("SQL_ADMIN_PASSWORD, SQL_PASSWORD, PGPASSWORD, or POSTGRES_PASSWORD must be set in environment variables.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: connectionString
    ? { url: connectionString, ssl: true } as any
    : {
        host: sqlHost,
        user: user,
        password: password,
        database: sqlDbName,
        ssl: false,
      },
  verbose: true,
});
