import { expect, test } from "@playwright/test";
import { audit, openExam, overflow, signIn } from "./helpers";

test.describe("phone layout (375px)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("student pages fit without sideways scrolling", async ({ page }) => {
    await signIn(page, "student@example.com");
    for (const path of ["/", "/results", "/account"]) {
      await page.goto(path);
      const o = await overflow(page);
      expect(o.scroll, `${path} overflows`).toBeLessThanOrEqual(o.view);
    }
    await page.goto("/");
    await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
    await page.getByRole("button", { name: /start exam|resume/i }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    await expect(page.getByText(/ \/ 5/)).toBeVisible();
    const o = await overflow(page);
    expect(o.scroll, "exam-taking screen overflows").toBeLessThanOrEqual(o.view);
  });

  test("teaching and admin pages fit, with the menu behind a button", async ({ page }) => {
    await signIn(page, "instructor@example.com");
    for (const path of ["/teach", "/teach/questions", "/teach/exams", "/teach/marking"]) {
      await page.goto(path);
      const o = await overflow(page);
      expect(o.scroll, `${path} overflows`).toBeLessThanOrEqual(o.view);
    }
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Question bank" })).toBeVisible();
    await page.keyboard.press("Escape");
    await openExam(page, /BIO 101 Midterm/);
    await expect(page.getByText("What each student gets")).toBeVisible();
    const o = await overflow(page);
    expect(o.scroll, "exam builder overflows").toBeLessThanOrEqual(o.view);
  });

  test("results, item analysis and an attempt record fit", async ({ page }) => {
    await signIn(page, "instructor@example.com");
    await openExam(page, /BIO 101 Practice/);
    await page.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Results" }).click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    let o = await overflow(page);
    expect(o.scroll, "results overflows").toBeLessThanOrEqual(o.view);

    await page.getByRole("link", { name: "Item analysis" }).click();
    await expect(page).toHaveURL(/\/analysis$/);
    o = await overflow(page);
    expect(o.scroll, "item analysis overflows").toBeLessThanOrEqual(o.view);

    await page.goBack();
    await page.getByRole("table").getByRole("link").first().click();
    await expect(page.getByText("Reproduce from seed")).toBeVisible();
    o = await overflow(page);
    expect(o.scroll, "attempt record overflows").toBeLessThanOrEqual(o.view);
  });

  test("admin pages fit", async ({ page }) => {
    await signIn(page, "admin@example.com");
    for (const path of ["/admin", "/admin/people", "/admin/courses", "/admin/activity", "/admin/settings"]) {
      await page.goto(path);
      const o = await overflow(page);
      expect(o.scroll, `${path} overflows`).toBeLessThanOrEqual(o.view);
    }
  });
});

test("moving between questions keeps keyboard focus on the question, and the timer is exposed", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
  await page.getByRole("button", { name: /start exam|resume/i }).click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByRole("heading", { level: 1, name: /BIO 101 Quiz/ })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveAccessibleName(/^Time left \d/);

  // Next, the navigator and Previous all land focus on the new question's heading.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Question 2 of 5/ })).toBeFocused();
  await page.getByRole("navigation", { name: "Questions" }).getByRole("button", { name: /^Question 4/ }).click();
  await expect(page.getByRole("heading", { name: /Question 4 of 5/ })).toBeFocused();
  await page.getByRole("button", { name: "Previous" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Question 3 of 5/ })).toBeFocused();

  // The skip link goes straight to the question.
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to question" })).toBeFocused();
});

test.describe("dark mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  });

  test("teaching and results pages stay accessible", async ({ page }) => {
    await signIn(page, "instructor@example.com");
    await expect(page.locator("html")).toHaveClass(/dark/);
    for (const [path, name] of [
      ["/teach", "teaching home"],
      ["/teach/questions", "question bank"],
      ["/teach/marking", "marking"],
    ] as const) {
      await page.goto(path);
      await audit(page, `${name}, dark`);
    }
    await openExam(page, /BIO 101 Midterm/);
    await audit(page, "exam builder, dark");
    await openExam(page, /BIO 101 Practice/);
    await page.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Run" }).click();
    await audit(page, "run, dark");
    await page.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Results" }).click();
    await audit(page, "results, dark");
    await page.getByRole("link", { name: "Item analysis" }).click();
    await expect(page).toHaveURL(/\/analysis$/);
    await audit(page, "item analysis, dark");
  });

  test("admin pages stay accessible", async ({ page }) => {
    await signIn(page, "admin@example.com");
    for (const path of ["/admin", "/admin/people", "/admin/activity"]) {
      await page.goto(path);
      await audit(page, `${path}, dark`);
    }
  });

  test("the exam-taking screen stays accessible", async ({ page }) => {
    await signIn(page, "student@example.com");
    await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
    await page.getByRole("button", { name: /start exam|resume/i }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    await audit(page, "exam-taking screen, dark");
  });
});

test("dark mode is chosen from the account menu, persists, and stays accessible", async ({ page }) => {
  await signIn(page, "student@example.com");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await audit(page, "student home, dark");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("a missing page says so and offers a way home", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: /can.t find that/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go back home" })).toBeVisible();
});

test("the skip link jumps past the navigation", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/results");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
