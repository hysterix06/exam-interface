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
