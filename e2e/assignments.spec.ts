import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// One assignment, end to end: a teacher writes and publishes it, a student
// hands in text and a PDF, the teacher marks it against the rubric and
// releases grades, and the student sees the mark, feedback and course grade.

const TITLE = `e2e Lab write-up ${Date.now()}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function asTeacher(page: Page) {
  await signIn(page, "instructor@example.com");
}

test.describe.serial("assignments", () => {
  let url = "";

  test("a teacher writes and publishes an assignment", async ({ page }) => {
    await asTeacher(page);
    await page.goto("/teach/assignments");
    await page.getByLabel("New assignment title").fill(TITLE);
    await page.getByRole("button", { name: "Create assignment" }).click();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    url = new URL(page.url()).pathname;

    await page.getByRole("textbox", { name: "Instructions" }).fill("Write up **the osmosis lab**.");
    const due = new Date(Date.now() + 3 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    await page.getByLabel("Due", { exact: true }).fill(`${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T17:00`);
    await page.getByLabel("Points", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel("Criterion 1", { exact: true }).fill("Clear hypothesis");
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel("Criterion 2", { exact: true }).fill("Discussion of results");
    await page.getByLabel("Weight of criterion 2").fill("3");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Open", { exact: true })).toBeVisible();
  });

  test("a student hands in text and a PDF", async ({ page }) => {
    await signIn(page, "student@example.com");
    await page.goto(url.replace("/teach", ""));
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByText("the osmosis lab")).toBeVisible();
    await page.getByLabel("Your answer").fill("Water moved into the potato.");
    await page.locator("#hand-in-file").setInputFiles({ name: "lab.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("lab.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Hand in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What you handed in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "lab.pdf" })).toBeVisible();
    // A fake file type is refused by its contents, whatever its name.
    await page.locator("#hand-in-file").setInputFiles({ name: "virus.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x4d, 0x5a, 0, 1, 2]) });
    await expect(page.getByText(/virus\.pdf: That file type isn’t accepted|virus\.pdf: That file type isn't accepted/)).toBeVisible();
  });

  test("the teacher marks it and releases grades", async ({ page }) => {
    await asTeacher(page);
    await page.goto(`${url}/handins`);
    await page.getByRole("link", { name: "Sam Student" }).click();
    await expect(page.getByText("Water moved into the potato.")).toBeVisible();
    await page.getByRole("checkbox", { name: /Discussion of results/ }).check();
    await page.getByLabel("Feedback for the student").fill("Good discussion; state your hypothesis.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved: 7.5 / 10.")).toBeVisible();
    await page.getByRole("button", { name: "Release grades" }).click();
    await expect(page.getByText("Grades released")).toBeVisible();
  });

  test("the student sees the grade and feedback", async ({ page }) => {
    await signIn(page, "student@example.com");
    await page.goto(url.replace("/teach", ""));
    await expect(page.getByText("Score: 7.5 / 10")).toBeVisible();
    await expect(page.getByText("state your hypothesis")).toBeVisible();
    await page.goto("/grades");
    await expect(page.getByRole("link", { name: new RegExp(TITLE) })).toBeVisible();
  });
});
