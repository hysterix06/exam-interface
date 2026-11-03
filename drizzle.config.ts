import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Migrations are written into supabase/migrations with Supabase's timestamp
// prefix, so `supabase db push` applies Drizzle's SQL and our hand-written
// RLS/trigger migrations in one ordered stream.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  migrations: { prefix: "supabase" },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
