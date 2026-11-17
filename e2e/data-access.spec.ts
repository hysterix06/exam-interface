import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { signIn } from "./helpers";

// Everyone can take their data: a ZIP of everything they can see, a read-only
// API token that sees exactly that, and a private calendar feed.

test("a student downloads everything as a ZIP", async ({ page }) => {
  await signIn(page, "student@example.com");
  await page.goto("/account/data");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Without files (smaller)" }).click()]);
  const zip = unzipSync(new Uint8Array(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c))));
  const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  expect(manifest).toMatchObject({ format: "modus-export", person: { email: "student@example.com", role: "student" } });
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(["README.md", "json/courses.json", "csv/courses.csv", "json/exam_answers.json"]));
  // Students never get answer keys: the questions are exported as they saw them.
  expect(Object.keys(zip)).not.toContain("json/attempt_items.json");
});

test("an API token reads what its owner can see, and stops when revoked", async ({ page, request }) => {
  await signIn(page, "student@example.com");
  await page.goto("/account/data");
  await page.getByLabel("Token name").fill("e2e token");
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = (await page.locator("code", { hasText: "modus_pat_" }).textContent())!.trim();
  const auth = { Authorization: `Bearer ${secret}` };

  const me = await request.get("/api/v1/me", { headers: auth });
  expect(me.status()).toBe(200);
  expect((await me.json()).data).toMatchObject({ email: "student@example.com", role: "student" });

  const courses = await (await request.get("/api/v1/courses?limit=1", { headers: auth })).json();
  expect(courses.data).toHaveLength(1);
  expect(courses.total).toBeGreaterThanOrEqual(2);
  expect(courses.next).toBeTruthy();
  // Someone else's course (or no course) is simply not found.
  expect((await request.get("/api/v1/courses/00000000-0000-0000-0000-00000000dead", { headers: auth })).status()).toBe(404);
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  expect((await request.get("/api/v1/openapi.json")).status()).toBe(200);

  await page.getByRole("listitem").filter({ hasText: "e2e token" }).getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "e2e token" })).toHaveCount(0);
  expect((await request.get("/api/v1/me", { headers: auth })).status()).toBe(401);
});

test("a private calendar feed serves iCalendar", async ({ page, request }) => {
  await signIn(page, "student@example.com");
  await page.goto("/account/data");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Get my calendar address|Make a new address/ }).click();
  const url = (await page.locator("code", { hasText: "/feeds/" }).textContent())!.trim();
  const res = await request.get(new URL(url).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(await res.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect((await request.get("/feeds/modus_cal_nope.ics")).status()).toBe(404);
});
