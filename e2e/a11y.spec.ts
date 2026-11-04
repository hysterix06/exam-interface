import { expect, test } from "@playwright/test";
import { audit, openExam, signIn } from "./helpers";

test("sign-in page", async ({ page }) => {
  await page.goto("/login");
  await audit(page, "login");
});

test("student pages", async ({ page }) => {
  await signIn(page, "student@example.com");
  await audit(page, "student home");
  await page.goto("/results");
  await audit(page, "results");
  await page.goto("/");
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
  await expect(page.getByRole("heading", { name: /BIO 101 Quiz/ })).toBeVisible();
  await audit(page, "exam info");
  await page.getByRole("button", { name: /start exam/i }).click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByText("1 / 5")).toBeVisible();
  await audit(page, "exam-taking screen");
});

test("teaching pages", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  for (const [path, name] of [
    ["/teach", "teaching home"],
    ["/teach/questions", "question bank"],
    ["/teach/exams", "exam list"],
    ["/teach/marking", "marking"],
    ["/teach/courses/00000000-0000-0000-0000-0000000000c1", "course"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
  await page.goto("/teach/questions/new?type=mcq");
  await expect(page.getByText(/Live preview/)).toBeVisible();
  await audit(page, "question editor");
  await openExam(page, /BIO 101 Midterm/);
  await expect(page.getByText("What each student gets")).toBeVisible();
  await audit(page, "exam builder");
  await page.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Verify" }).click();
  await audit(page, "verify");
});

test("admin pages", async ({ page }) => {
  await signIn(page, "admin@example.com");
  for (const [path, name] of [
    ["/admin", "overview"],
    ["/admin/people", "people"],
    ["/admin/courses", "courses"],
    ["/admin/activity", "activity"],
    ["/admin/settings", "settings"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
});

const TYPES = ["mcq", "true-false", "dropdown", "short-answer", "ordering", "matching", "cloze", "numeric", "long-answer", "table-fill", "spreadsheet", "widget"];

test("every question type's editor and preview", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  for (const type of TYPES) {
    await page.goto(`/teach/questions/new?type=${type}`);
    await expect(page.getByText(/Live preview/)).toBeVisible();
    await audit(page, `${type} editor`);
  }
});
