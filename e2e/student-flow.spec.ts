import { config } from "dotenv";
import { expect, type Page, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });
const PASSWORD = process.env.SEED_PASSWORD!;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(exams|author)/);
}

test("student enters, answers, resumes after reload, submits", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/exams");
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await page.getByRole("button", { name: /start exam|resume exam/i }).click();
  await expect(page).toHaveURL(/\/attempt\//);

  await expect(page.getByText("1 / 5")).toBeVisible();
  // Answer question 1 with whatever control its type renders.
  const radio = page.getByRole("radio").first();
  const box = page.getByRole("textbox", { name: "Your answer" });
  const select = page.getByRole("combobox", { name: "Your answer" });
  if (await radio.count()) await radio.check();
  else if (await box.count()) await box.fill("46");
  else await select.selectOption({ index: 1 });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Reload mid-attempt: the same attempt comes back with the answer kept.
  await page.reload();
  await expect(page.getByText("1 / 5")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Questions" }).getByRole("button", { name: /Question 1, answered/ })).toBeVisible();

  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Yes, submit" }).click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByText(/submitted/i)).toBeVisible();
});

test("a student cannot reach authoring", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/author");
  await expect(page).toHaveURL(/\/exams/);
});

test("staff preview runs the same screen and is flagged", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  await page.goto("/author/exams");
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await page.getByRole("button", { name: "Take it as a student" }).click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByText(/excluded from results/i)).toBeVisible();
});
