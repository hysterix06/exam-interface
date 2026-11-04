import { config } from "dotenv";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

config({ path: ".env.local", quiet: true });

export const PASSWORD = process.env.SEED_PASSWORD!;

const HOME: Record<string, RegExp> = {
  "admin@example.com": /\/admin$/,
  "instructor@example.com": /\/teach$/,
  "instructor2@example.com": /\/teach$/,
  "student@example.com": /:\d+\/$/,
};

/** Sign in as a demo account and wait for that role's own home. */
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(HOME[email]);
}

// WCAG 2.1 A/AA rules. Anything axe reports here is a real barrier for someone.
export async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.help} — ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `${name} has accessibility violations`).toEqual([]);
}

export const overflow = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));

/** Open an exam's workspace from the instructor's exam list. */
export async function openExam(page: Page, name: RegExp) {
  await page.goto("/teach/exams");
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("navigation", { name: "Exam" })).toBeVisible();
}
