import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connects as the database owner, so RLS does not apply here: every caller
// must authorize through requireRole() first. Supabase's transaction pooler
// (port 6543) does not support prepared statements, hence prepare: false.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, { prepare: false, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type Db = typeof db;
