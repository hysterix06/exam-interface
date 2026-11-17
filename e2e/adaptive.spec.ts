import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// Live adaptive: the demo quiz is switched to adaptive for this test, then put back.
const QUIZ = "BIO 101 Quiz (open)";

test("an adaptive exam picks each next question on the server and explains why", async ({ page, browser }) => {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [exam] = await sql`select id, settings from exams where title = ${QUIZ}`;
  const original = exam.settings;
  try {
    await sql`update exams set settings = ${sql.json({ ...original, adaptive: { rule: "staircase", length: 4, threshold: 0.5 } })} where id = ${exam.id}`;
    await sql`delete from attempts where exam_id = ${exam.id}`;

    await signIn(page, "student@example.com");
    await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
    await page.getByRole("button", { name: /start exam/i }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    const attemptId = page.url().split("/attempt/")[1];
    await expect(page.getByRole("heading", { name: "Question 1 of 4" })).toBeVisible();

    const count = async () => Number((await sql`select count(*)::int as n from attempt_items where attempt_id = ${attemptId}`)[0].n);
    expect(await count()).toBe(1);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Question 2 of 4" })).toBeVisible();
    expect(await count()).toBe(2);

    // Submitting early fills the rest as unanswered, so the total is out of all 4.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page).toHaveURL(/\/results\//);
    expect(await count()).toBe(4);
    const [a] = await sql`select plan from attempts where id = ${attemptId}`;
    expect(a.plan.rule).toBe("staircase");

    // Staff see why each question was chosen, and the path replays exactly.
    const staff = await browser.newPage();
    await signIn(staff, "instructor@example.com");
    await staff.goto(`/teach/exams/${exam.id}/results/${attemptId}`);
    await expect(staff.getByText(/Why this question: Started at/)).toBeVisible();
    await expect(staff.getByText(/Rebuilding this exam from its seed gives exactly what the student saw/)).toBeVisible();
    await staff.close();
  } finally {
    await sql`update exams set settings = ${sql.json(original)} where id = ${exam.id}`;
    await sql`delete from attempts where exam_id = ${exam.id}`;
    await sql.end();
  }
});
