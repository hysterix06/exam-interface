import { expect, test, type Page } from "@playwright/test";
import { audit, signIn } from "./helpers";

const BIO = "00000000-0000-0000-0000-0000000000c1";
// Seeded (src/db/seed/demo-phones.ts): the BIO teacher is in the UK, the student in Canada.
const TEACHER = { national: "020 7946 0958", international: "+44 20 7946 0958", href: "tel:+442079460958" };
const STUDENT = { international: "+1 416 555 0123", href: "tel:+14165550123" };

/** Paste text into a field the way a browser does, so the paste handler (not just typing) runs. */
async function paste(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData("text", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("a student sees their teacher's number in international form, linked as tel:", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto(`/courses/${BIO}`);
  const link = page.getByRole("link", { name: TEACHER.international });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", TEACHER.href);
});

test("a teacher sees a student's number internationally, and their own nationally", async ({ page }) => {
  await signIn(page, "instructor@example.com");
  await page.goto(`/teach/courses/${BIO}/people`);
  const student = page.getByRole("link", { name: STUDENT.international });
  await expect(student).toBeVisible();
  await expect(student).toHaveAttribute("href", STUDENT.href);
  // Same region as the viewer: national notation, but the link is still bare E.164.
  const own = page.getByRole("link", { name: TEACHER.national });
  await expect(own).toBeVisible();
  await expect(own).toHaveAttribute("href", TEACHER.href);
});

test("pasting a number resolves its country and reformats it; saving, then clearing, works", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/account");
  await audit(page, "account");

  const country = page.getByLabel("Phone country");
  const phone = page.getByLabel("Phone", { exact: true });
  // The account page has several forms; this is the one with the phone field.
  const form = page.locator("form").filter({ has: phone });
  const save = form.getByRole("button", { name: "Save" });
  const saved = form.getByText("Saved.");
  // Saved number: Canada, shown nationally.
  await expect(country).toHaveValue("CA");
  await expect(phone).toHaveValue("(416) 555-0123");

  try {
    // 0086… with the country on Canada (IDD 011) still resolves to China.
    await paste(page, "Phone", "0086-138 1234 5678");
    await expect(country).toHaveValue("CN");
    await expect(phone).toHaveValue("138 1234 5678");
    await save.click();
    await expect(saved).toBeVisible();
    await page.reload();
    await expect(country).toHaveValue("CN");

    // A number that can't be valid is refused with a reason, and nothing is stored.
    await phone.fill("12");
    await save.click();
    await expect(form.getByText(/phone number/i).last()).toBeVisible();
    await expect(saved).toHaveCount(0);

    // Blank removes it.
    await phone.fill("");
    await save.click();
    await expect(saved).toBeVisible();
    await page.reload();
    await expect(phone).toHaveValue("");
  } finally {
    // Put the demo number back for the other specs.
    await page.goto("/account");
    await paste(page, "Phone", "+1 416 555 0123");
    await expect(country).toHaveValue("CA");
    await save.click();
    await expect(saved).toBeVisible();
  }
});

test("an admin adds a person with a phone number", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/people");
  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog");
  await audit(page, "add person dialog");
  const email = `e2e-phone-${Date.now()}@example.com`;
  await dialog.getByLabel("Name").fill("Phoebe Phone");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Phone (optional) country").selectOption("GB");
  await dialog.getByLabel("Phone (optional)", { exact: true }).pressSequentially("02079460958");
  await expect(dialog.getByLabel("Phone (optional)", { exact: true })).toHaveValue("020 7946 0958");
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(dialog.locator("code")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // The admin has no number of their own, so it is shown internationally.
  await page.getByRole("textbox", { name: "Search people" }).fill(email);
  const link = page.getByRole("link", { name: TEACHER.international });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", TEACHER.href);
});

test("a bad number in an import is reported on its own line", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin/people");
  await page.getByRole("button", { name: "Import list" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Country for phone numbers without a + prefix").selectOption("GB");
  await dialog.getByLabel("People to import").fill(
    "Ada Ok, e2e-ok@example.com, +44 20 7946 0958\nBad Number, e2e-bad@example.com, 12345678901234567",
  );
  await dialog.getByRole("button", { name: "Check list" }).click();
  await expect(dialog.getByText("1 person found")).toBeVisible();
  await expect(dialog.getByText("+44 20 7946 0958")).toBeVisible();
  await expect(dialog.getByText(/Line 2/)).toBeVisible();
  await expect(dialog.getByText(/valid phone number/)).toBeVisible();
});
