import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// One question at a time, enforced by the server: the demo quiz is switched to
// one-way with a per-question time limit for this test, then put back.
const QUIZ = "BIO 101 Quiz (open)";

test("a timed one-way exam hands out one question at a time and moves on by itself", async ({ page }) => {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [exam] = await sql`select id, settings from exams where title = ${QUIZ}`;
  const original = exam.settings;
  try {
    await sql`update exams set settings = ${sql.json({ ...original, oneWayNavigation: true, questionTimeLimitSeconds: 12 })} where id = ${exam.id}`;
    await sql`delete from attempts where exam_id = ${exam.id}`;

    await signIn(page, "student@example.com");
    await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
    await expect(page.getByText(/12 seconds per question/)).toBeVisible();
    await page.getByRole("button", { name: /start exam/i }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    const attemptId = page.url().split("/attempt/")[1];

    // Only question 1 reaches the browser; later ones are placeholders.
    const nav = page.getByRole("navigation", { name: "Questions" });
    await expect(nav.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("timer", { name: /Time left on this question/ })).toBeVisible();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Question 2 of 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await expect(nav.getByRole("button", { name: /^Question 1\b/ })).toBeDisabled();

    // Waiting out question 2's time opens question 3 without a click.
    await expect(page.getByRole("heading", { name: "Question 3 of 5" })).toBeVisible({ timeout: 25_000 });

    // The server refuses answers to a question already passed.
    const [first] = await sql`select ai.id from attempt_items ai where ai.attempt_id = ${attemptId} and ai.position = 0`;
    const [cursor] = await sql`select cursor from attempts where id = ${attemptId}`;
    expect(cursor.cursor).toBe(2);
    const locked = await sql`select locked_at from attempt_items where id = ${first.id}`;
    expect(locked[0].locked_at).not.toBeNull();
  } finally {
    await sql`update exams set settings = ${sql.json(original)} where id = ${exam.id}`;
    await sql`delete from attempts where exam_id = ${exam.id}`;
    await sql.end();
  }
});
