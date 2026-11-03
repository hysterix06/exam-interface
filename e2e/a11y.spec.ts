import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, type Page, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(exams|author)/);
}

// WCAG 2.1 A/AA rules. Anything axe reports here is a real barrier for someone.
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.help} — ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `${name} has accessibility violations`).toEqual([]);
}

test("sign-in page", async ({ page }) => {
  await page.goto("/login");
  await audit(page, "login");
});

test("student pages", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams");
  await audit(page, "exam list");
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await expect(page.getByRole("heading", { name: /BIO 101 Quiz/ })).toBeVisible();
  await audit(page, "exam info");
  await page.getByRole("button", { name: /start exam/i }).click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByText("1 / 5")).toBeVisible();
  await audit(page, "exam-taking screen");
});

test("authoring pages", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  for (const [path, name] of [
    ["/author", "authoring overview"],
    ["/author/questions", "question bank"],
    ["/author/topics", "topics"],
    ["/author/exams", "exam list"],
    ["/admin/exams", "run exams"],
    ["/admin/audit", "audit log"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
  await page.goto("/author/questions/new?type=mcq");
  await expect(page.getByText(/Live preview/)).toBeVisible();
  await audit(page, "question editor");
  await page.goto("/author/exams");
  await page.getByRole("link", { name: /BIO 101 Midterm/ }).click();
  await expect(page.getByText("What each student gets")).toBeVisible();
  await audit(page, "exam builder");
});

const TYPES = ["mcq", "true-false", "dropdown", "short-answer", "ordering", "matching", "cloze", "numeric", "long-answer", "table-fill", "spreadsheet", "widget"];

test("every question type's editor and preview", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  for (const type of TYPES) {
    await page.goto(`/author/questions/new?type=${type}`);
    await expect(page.getByText(/Live preview/)).toBeVisible();
    await audit(page, `${type} editor`);
  }
});
