import { expect, type Page, test } from "@playwright/test";

// A bare page on the app's own origin stands in for the exam page. (Chromium blocks a
// null-origin page from embedding localhost frames, so about:blank would not do.)
async function host(page: Page) {
  await page.route("**/__harness", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>harness</title><body></body>" }));
  await page.goto("/__harness");
}

// Plays the part of the exam page: embeds the demo till in a sandboxed iframe,
// waits for exam:ready, sends exam:init, and reads back exam:response.
test("the demo till speaks the widget protocol", async ({ page }) => {
  await host(page);
  await page.evaluate(() => {
    document.body.innerHTML = '<iframe id="w" title="till" sandbox="allow-scripts" src="/widgets/pos-demo.html" style="width:700px;height:420px"></iframe>';
    const w = window as unknown as { log: unknown[] };
    w.log = [];
    window.addEventListener("message", (e) => {
      const frame = document.getElementById("w") as HTMLIFrameElement;
      if (e.source !== frame.contentWindow) return;
      w.log.push(e.data);
      if (e.data?.type === "exam:ready") {
        frame.contentWindow!.postMessage(
          { type: "exam:init", version: 1, state: null, readOnly: false, config: { menu: [{ name: "Coffee", price: 3 }, { name: "Croissant", price: 4 }], discounts: [0, 10] } },
          "*",
        );
      }
    });
  });

  const till = page.frameLocator("#w");
  await expect(till.getByRole("button", { name: /^Coffee \d/ })).toBeVisible();

  // Menu buttons read "Coffee 3.00"; the order has its own "One more Coffee" buttons.
  const menuItem = (name: string) => till.getByRole("button", { name: new RegExp(`^${name} \\d`) });
  await menuItem("Coffee").click();
  await menuItem("Coffee").click();
  await menuItem("Croissant").click();
  await till.getByLabel("Discount").selectOption("10");
  await expect(till.locator("#total")).toHaveText("9.00");

  type Msg = { type: string; state?: { total?: number } };
  const readLog = () => page.evaluate(() => (window as unknown as { log: Msg[] }).log);
  // postMessage delivery is asynchronous, so wait for the last report rather than reading once.
  await expect.poll(async () => (await readLog()).at(-1)?.state?.total).toBe(9);

  const log = await readLog();
  expect(log[0]).toMatchObject({ type: "exam:ready", version: 1 });
  expect(log.at(-1)).toMatchObject({
    type: "exam:response",
    version: 1,
    state: { discountPct: 10, total: 9, order: [{ name: "Coffee", qty: 2, price: 3 }, { name: "Croissant", qty: 1, price: 4 }] },
  });
});

test("a read-only till shows a saved order and cannot be changed", async ({ page }) => {
  await host(page);
  await page.evaluate(() => {
    document.body.innerHTML = '<iframe id="w" title="till" sandbox="allow-scripts" src="/widgets/pos-demo.html" style="width:700px;height:420px"></iframe>';
    window.addEventListener("message", (e) => {
      const frame = document.getElementById("w") as HTMLIFrameElement;
      if (e.source === frame.contentWindow && e.data?.type === "exam:ready") {
        frame.contentWindow!.postMessage(
          { type: "exam:init", version: 1, readOnly: true, config: { menu: [{ name: "Coffee", price: 3 }], discounts: [0, 10] }, state: { order: [{ name: "Coffee", qty: 2, price: 3 }], discountPct: 10, total: 5.4 } },
          "*",
        );
      }
    });
  });
  const till = page.frameLocator("#w");
  await expect(till.locator("#total")).toHaveText("5.40");
  await expect(till.getByRole("button", { name: /^Coffee \d/ })).toBeDisabled();
  await expect(till.getByLabel("Discount")).toBeDisabled();
});
