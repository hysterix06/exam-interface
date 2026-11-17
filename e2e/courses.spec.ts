import { expect, test } from "@playwright/test";
import { audit, overflow, signIn } from "./helpers";

// The student app: a sidebar of courses, each with its own homepage, syllabus,
// calendar, work and grades; and one calendar across every course.

const BIO = "/courses/00000000-0000-0000-0000-0000000000c1";

test("a student finds a course's syllabus, teacher, calendar and grade breakdown", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /BIO 101/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Introduction to Biology" })).toBeVisible();
  await expect(page.getByRole("link", { name: "instructor@example.com" })).toHaveAttribute("href", "mailto:instructor@example.com");
  await expect(page.getByText("Office hours")).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Course" });
  await tabs.getByRole("link", { name: "Syllabus" }).click();
  await expect(page.getByRole("heading", { name: "How your grade is worked out" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Homework" })).toBeVisible();

  await tabs.getByRole("link", { name: "Grades" }).click();
  await expect(page.getByText("Course grade so far")).toBeVisible();
  await expect(page.getByText(/^Course grade: /)).toBeVisible();

  await tabs.getByRole("link", { name: "Work" }).click();
  await expect(page.getByRole("link", { name: /Osmosis lab report/ })).toBeVisible();

  await tabs.getByRole("link", { name: "Calendar" }).click();
  await page.getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/view=agenda/);
  await expect(page.getByText("Lecture").first()).toBeVisible();
});

test("the calendar moves between months and the home page shows the week ahead", async ({ page }) => {
  await signIn(page, "student@example.com");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  const title = await page.getByRole("heading", { level: 2 }).first().textContent();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).not.toHaveText(title!);
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(title!);
});

test("a student can't open a course they aren't in", async ({ page }) => {
  await signIn(page, "student@example.com");
  // Not "forbidden": outside your courses, it simply doesn't exist.
  await page.goto("/courses/00000000-0000-0000-0000-00000000dead");
  await expect(page.getByRole("heading", { name: /can.t find that/i })).toBeVisible();
});

test("new student pages pass accessibility checks and fit a phone", async ({ page }) => {
  await signIn(page, "student@example.com");
  for (const path of ["/", "/calendar", "/grades", "/account/data", BIO, `${BIO}/syllabus`, `${BIO}/grades`, `${BIO}/work`]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await audit(page, path);
    await page.setViewportSize({ width: 375, height: 800 });
    const o = await overflow(page);
    expect(o.scroll, `${path} scrolls sideways on a phone`).toBeLessThanOrEqual(o.view);
  }
});

test("teacher course workspace pages pass accessibility checks", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  const base = "/teach/courses/00000000-0000-0000-0000-0000000000c1";
  for (const path of [`${base}/details`, `${base}/calendar`, `${base}/grading`, `${base}/assignments`, `${base}/gradebook`, "/teach/assignments"]) {
    await page.goto(path);
    await audit(page, path);
  }
});
