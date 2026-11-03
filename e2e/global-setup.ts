import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

// Every run starts from the same place: the seeded open quiz, open, with no
// attempts, so students never run out of attempts between runs.
export default async function globalSetup() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const [exam] = await sql`select id from exams where title = 'BIO 101 Quiz (open)'`;
    if (!exam) throw new Error("Demo exam missing. Run `npm run db:seed` first.");
    await sql`delete from attempts where exam_id = ${exam.id}`;
    await sql`delete from extensions where exam_id = ${exam.id}`;
    await sql`update exams set state = 'open', opens_at = null, closes_at = null where id = ${exam.id}`;
  } finally {
    await sql.end();
  }
}
