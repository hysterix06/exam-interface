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

const overflow = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));

test.describe("phone layout (375px)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("student pages fit without sideways scrolling", async ({ page }) => {
    await signIn(page, "student@example.com");
    for (const path of ["/exams"]) {
      await page.goto(path);
      const o = await overflow(page);
      expect(o.scroll, `${path} overflows`).toBeLessThanOrEqual(o.view);
    }
    await page.getByRole("link", { name: /BIO 101 Quiz/ }).click();
    await page.getByRole("button", { name: /start exam|resume exam/i }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    await expect(page.getByText(/ \/ 5/)).toBeVisible();
    const o = await overflow(page);
    expect(o.scroll, "exam-taking screen overflows").toBeLessThanOrEqual(o.view);
  });

  test("authoring pages fit without sideways scrolling", async ({ page }) => {
    await signIn(page, "instructor@example.com");
    for (const path of ["/author", "/author/questions", "/author/topics", "/author/exams", "/admin/exams"]) {
      await page.goto(path);
      const o = await overflow(page);
      expect(o.scroll, `${path} overflows`).toBeLessThanOrEqual(o.view);
    }
    await page.goto("/author/exams");
    await page.getByRole("link", { name: /BIO 101 Midterm/ }).click();
    await expect(page.getByText("What each student gets")).toBeVisible();
    const o = await overflow(page);
    expect(o.scroll, "exam builder overflows").toBeLessThanOrEqual(o.view);
  });
});

test("dark mode toggles, persists across a reload, and stays accessible", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("a missing page says so and offers a way home", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: /can.t find that page/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
});

test("the skip link jumps past the navigation", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
