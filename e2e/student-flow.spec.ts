import { expect, test } from "@playwright/test";
import { openExam, signIn } from "./helpers";

test("student starts from home, answers, resumes after reload, submits", async ({ page }) => {
  await signIn(page, "student@example.com");
  await expect(page.getByRole("heading", { name: "Ready for you" })).toBeVisible();
  await page.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
  await page.getByRole("button", { name: /start exam|resume/i }).click();
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

  // The submit dialog lists what's unanswered.
  await page.getByRole("button", { name: "Submit" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit your exam?" });
  await expect(dialog.getByText(/4 unanswered/)).toBeVisible();
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/results\//);

  // It shows up under Results.
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByRole("link", { name: /BIO 101 Quiz/ }).first()).toBeVisible();
});

test("a student cannot reach teaching or admin", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/teach");
  await expect(page).toHaveURL(/:\d+\/$/);
  await page.goto("/admin/people");
  await expect(page).toHaveURL(/:\d+\/$/);
});

test("staff preview runs the same screen, is flagged, and can be found again", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  await openExam(page, /BIO 101 Quiz/);
  await page.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Take it as a student" }).click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByText(/never counts in results/i)).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByRole("link", { name: /Resume/ }).first()).toBeVisible();
});
