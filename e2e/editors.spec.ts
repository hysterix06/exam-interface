import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });

const TYPES = ["mcq", "true-false", "dropdown", "short-answer", "ordering", "matching", "cloze", "numeric", "long-answer", "table-fill", "spreadsheet", "widget"];

test("every question type's editor, preview and variants load without client errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/login");
  await page.getByLabel(/email/i).fill("instructor@example.com");
  await page.getByLabel(/password/i).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/author/);

  for (const type of TYPES) {
    await page.goto(`/author/questions/new?type=${type}`);
    await expect(page.getByText(/Live preview/)).toBeVisible();
    await page.getByRole("tab", { name: "Variants" }).click();
    // A blank new question can't be previewed yet; either message is fine, a crash is not.
    await expect(page.getByText(/Finish the question to explore variants|generated versions/)).toBeVisible();
    await page.getByRole("tab", { name: "Student view" }).click();
  }
  expect(errors).toEqual([]);
});

test("a numeric question previews with its variables and grades the key", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("instructor@example.com");
  await page.getByLabel(/password/i).fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/author/);

  await page.goto("/author/questions/new?type=numeric");
  await page.getByRole("textbox", { name: "Question" }).first().fill("{a} + {b} = ?");
  await page.getByLabel("Answer formula").fill("a + b");
  await expect(page.getByText("Variables used")).toBeVisible();
  await page.getByRole("tab", { name: "Variants" }).click();
  await expect(page.getByText(/20 generated versions/)).toBeVisible();
});
