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

test("an educator can watch a live attempt, review it, and see the audit trail", async ({ browser }) => {
  // A student starts and finishes an attempt in their own browser context.
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signIn(student, "student@example.com");
  await student.goto("/exams");
  await student.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await student.getByRole("button", { name: /start exam/i }).click();
  await expect(student).toHaveURL(/\/attempt\//);

  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  const errors: string[] = [];
  staff.on("pageerror", (e) => errors.push(e.message));
  await signIn(staff, "instructor@example.com");

  // Live view shows the student in progress.
  await staff.goto("/admin/exams");
  await staff.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await staff.getByRole("link", { name: "Live view" }).click();
  await expect(staff.getByRole("cell", { name: "Sam Student" }).first()).toBeVisible();
  await expect(staff.getByText(/1 in progress/)).toBeVisible();

  // Grant extra time with a reason; it lands in the audit log.
  // Newest attempt first: the one still in progress.
  await staff.getByRole("button", { name: "Add time" }).first().click();
  await staff.getByLabel("Reason").fill("Playwright accommodation");
  await staff.getByRole("button", { name: "Grant" }).click();
  await expect(staff.getByText("Extra time for")).toBeHidden();

  // The student submits; the educator opens the full record.
  await student.getByRole("button", { name: "Submit" }).click();
  await student.getByRole("button", { name: "Yes, submit" }).click();
  await expect(student).toHaveURL(/\/results\//);

  await staff.goto("/admin/exams");
  await staff.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await staff.getByRole("link", { name: "Details" }).first().click();
  await expect(staff.getByText("Reproduce from seed")).toBeVisible();
  await expect(staff.getByText(/gives exactly what the student saw/)).toBeVisible();
  await expect(staff.getByRole("button", { name: /Print/ })).toBeVisible();

  await staff.goto("/admin/audit");
  await expect(staff.getByText("extension.add").first()).toBeVisible();
  await expect(staff.getByText("Playwright accommodation").first()).toBeVisible();

  // The regrade tool loads for a question with answers.
  await staff.goto("/admin/exams");
  await staff.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await staff.getByRole("link", { name: "Regrade" }).click();
  await staff.getByRole("button", { name: "Preview changes" }).click();
  await expect(staff.getByText(/No scores would change|would change/)).toBeVisible();

  // CSV export is a real download with a header row.
  const download = staff.waitForEvent("download");
  await staff.goto("/admin/exams");
  await staff.getByRole("link", { name: /BIO 101 Quiz/ }).click();
  await staff.getByRole("link", { name: "Export CSV" }).click();
  const csv = await (await download).createReadStream();
  const text = await new Promise<string>((resolve) => {
    let out = "";
    csv.on("data", (c) => (out += c));
    csv.on("end", () => resolve(out));
  });
  expect(text.split("\r\n")[0]).toBe("Student,Email,Status,Score,Out of,Percent,Started,Submitted");
  expect(text).toContain("student@example.com");

  expect(errors).toEqual([]);
  await studentCtx.close();
  await staffCtx.close();
});

test("students cannot reach the admin pages or the export", async ({ page, request }) => {
  await signIn(page, "student@example.com");
  await page.goto("/admin/exams");
  await expect(page).toHaveURL(/\/exams$/);
  const res = await page.request.get("/admin/exams/00000000-0000-0000-0000-000000000000/export", { maxRedirects: 0 });
  expect([307, 403]).toContain(res.status());
  expect(request).toBeTruthy();
});
