import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// Realtime: an exam closing and reopening shows up on a student's home screen
// within seconds, long before the two-minute safety poll would catch it.
test("the student home updates by itself when an exam is closed and reopened", async ({ page }) => {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [exam] = await sql`select id from exams where title = 'BIO 101 Quiz (open)'`;
  try {
    // An attempt in progress keeps the quiz under "Ready for you" (as Resume) even when closed.
    await sql`delete from attempts where exam_id = ${exam.id}`;
    await signIn(page, "student@example.com");
    const ready = page.getByRole("region", { name: "Ready for you" }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Ready for you" }) }));
    await expect(ready.getByRole("link", { name: /BIO 101 Quiz/ })).toBeVisible();
    // Give the channel a moment to join before the change.
    await page.waitForTimeout(3_000);

    await sql`update exams set state = 'closed' where id = ${exam.id}`;
    await expect(ready.getByRole("link", { name: /BIO 101 Quiz/ })).toHaveCount(0, { timeout: 15_000 });

    await sql`update exams set state = 'open' where id = ${exam.id}`;
    await expect(ready.getByRole("link", { name: /BIO 101 Quiz/ })).toBeVisible({ timeout: 15_000 });
  } finally {
    await sql`update exams set state = 'open' where id = ${exam.id}`;
    await sql.end();
  }
});
