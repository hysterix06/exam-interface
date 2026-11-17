import { expect, test } from "@playwright/test";
import { openExam, signIn } from "./helpers";

test("an instructor can watch a live attempt, grant time, and read the results", async ({ browser }) => {
  // A student starts an attempt in their own browser context.
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signIn(student, "student@example.com");
  await student.getByRole("link", { name: /BIO 101 Quiz/ }).first().click();
  // Earlier specs may already have started this student's attempt; either way it is in progress.
  await student.getByRole("button", { name: /start exam|resume/i }).click();
  await expect(student).toHaveURL(/\/attempt\//);

  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  const errors: string[] = [];
  staff.on("pageerror", (e) => errors.push(e.message));
  await signIn(staff, "instructor@example.com");

  // Home surfaces the live exam; the Run tab shows the student in progress.
  await expect(staff.getByRole("heading", { name: "Live now" })).toBeVisible();
  await openExam(staff, /BIO 101 Quiz/);
  await staff.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Run" }).click();
  await expect(staff.getByRole("cell", { name: "Sam Student" }).first()).toBeVisible();
  await expect(staff.getByText(/1 in progress/)).toBeVisible();
  // Enrolled students who haven't started are listed too.
  await expect(staff.getByRole("heading", { name: /Not started/ })).toBeVisible();

  // Grant extra time with a reason; it's listed and lands in the exam's history.
  await staff.getByRole("button", { name: "Add time" }).first().click();
  await staff.getByLabel("Reason").fill("Playwright accommodation");
  await staff.getByRole("button", { name: "Grant" }).click();
  await expect(staff.getByRole("heading", { name: "Extra time granted" })).toBeVisible();

  // The student submits; the instructor opens the full record.
  await student.getByRole("button", { name: "Submit" }).click();
  await student.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await expect(student).toHaveURL(/\/results\//);

  await staff.getByRole("navigation", { name: "Exam" }).getByRole("link", { name: "Results" }).click();
  await expect(staff.getByText("granted extra time").first()).toBeVisible();
  await staff.getByRole("link", { name: "Sam Student" }).first().click();
  await expect(staff.getByText("Reproduce from seed")).toBeVisible();
  await expect(staff.getByText(/gives exactly what the student saw/)).toBeVisible();

  // Change one answer's score by hand: the badge and the breakdown say who and why.
  await staff.getByRole("button", { name: "Change score" }).first().click();
  const dlg = staff.getByRole("dialog");
  await dlg.getByLabel(/New score/).fill("0");
  await dlg.getByLabel("Reason").fill("Playwright override");
  await dlg.getByRole("button", { name: "Save score" }).click();
  await expect(dlg).toBeHidden();
  await expect(staff.getByText("score changed by hand").first()).toBeVisible();
  await expect(staff.getByText(/Changed by .*: Playwright override/)).toBeVisible();
  await staff.goBack();
  await expect(staff.getByText(/changed a score by hand \(Sam Student, question 1\)/).first()).toBeVisible();

  // Regrade preview loads (from the Results page we're back on).
  await staff.getByRole("link", { name: "Regrade" }).click();
  await staff.getByRole("button", { name: "Preview changes" }).click();
  await expect(staff.getByText(/No scores would change|would change/)).toBeVisible();

  // Both CSV exports are real downloads with a header row.
  await staff.goBack();
  const read = async (link: string) => {
    const download = staff.waitForEvent("download");
    await staff.getByRole("button", { name: "Export" }).click();
    await staff.getByRole("menuitem", { name: link }).click();
    const csv = await (await download).createReadStream();
    return new Promise<string>((resolve) => {
      let out = "";
      csv.on("data", (c) => (out += c));
      csv.on("end", () => resolve(out));
    });
  };
  const summary = await read("Scores (CSV)");
  expect(summary.split("\r\n")[0]).toBe("Student,Email,Status,Score,Out of,Percent,Started,Submitted,Extra time,Tab switches,Pastes,Attempt ID,Seed,Minutes late,Late penalty (points)");
  expect(summary).toContain("student@example.com");
  expect(summary).toContain("+10 min");
  const answers = await read("Answers (CSV)");
  expect(answers.split("\r\n")[0]).toBe("Student,Email,Attempt ID,Question #,Question,Topic,Version,Score,Out of,Graded by,Needs marking,Score changed by hand");
  expect(answers).toContain("Playwright override");

  expect(errors).toEqual([]);
  await studentCtx.close();
  await staffCtx.close();
});

test("an instructor only sees the courses they teach", async ({ page }) => {
  await signIn(page, "instructor2@example.com");
  await page.goto("/teach/exams");
  await expect(page.getByRole("link", { name: /BIO 101/ })).toHaveCount(0);
  // Even a direct link to another course's exam is a 404, as is its export.
  const res = await page.request.get("/teach/exams", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  await page.goto("/teach/courses/00000000-0000-0000-0000-0000000000c1");
  await expect(page.getByRole("heading", { name: /can.t find that/i })).toBeVisible();
});

test("an admin adds a person, enrols them, and they see the open exam", async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, "admin@example.com");
  const email = `e2e-${Date.now()}@example.com`;

  await admin.getByRole("link", { name: "People" }).first().click();
  await admin.getByRole("button", { name: "Add person" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Eve Tester");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Enrol in").selectOption({ label: "BIO 101 · Introduction to Biology" });
  await dialog.getByRole("button", { name: "Add person" }).click();
  const password = (await dialog.locator("code").textContent())!.trim();
  expect(password).toHaveLength(12);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(admin.getByRole("link", { name: "Eve Tester" })).toBeVisible();

  const newCtx = await browser.newContext();
  const eve = await newCtx.newPage();
  await eve.goto("/login");
  await eve.getByLabel(/email/i).fill(email);
  await eve.getByLabel(/password/i).fill(password);
  await eve.getByRole("button", { name: /sign in/i }).click();
  await expect(eve.getByRole("link", { name: /BIO 101 Quiz/ }).first()).toBeVisible();

  // Switching the account off signs them out of everything.
  await admin.getByRole("link", { name: "Eve Tester" }).click();
  await admin.getByRole("button", { name: "Switch off account" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Switch off" }).click();
  await expect(admin.getByText("Switched off").first()).toBeVisible();
  await eve.reload();
  await expect(eve).toHaveURL(/\/login/);

  await adminCtx.close();
  await newCtx.close();
});

test("students cannot reach admin pages or the export", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/admin");
  await expect(page).toHaveURL(/:\d+\/$/);
  const res = await page.request.get("/teach/exams/00000000-0000-0000-0000-000000000000/export", { maxRedirects: 0 });
  expect([307, 403]).toContain(res.status());
});

test("the people list filters as you go, and Clear resets it", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/people");
  await expect(page.getByRole("button", { name: "Filter" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Role" }).selectOption("instructor");
  await expect(page).toHaveURL(/role=instructor/);
  await expect(page.getByRole("link", { name: /student@example.com|Sam Student/ })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Search people" }).fill("instructor2");
  await expect(page).toHaveURL(/q=instructor2/);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/admin\/people$/);
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Search people" })).toHaveValue("");
});
