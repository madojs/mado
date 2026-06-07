// E2E through node:test + playwright-core. No Jest/Vitest/Cypress.
//
// Run:
//   node --test test/e2e.test.mjs
//
// Requirements:
//   1. build has completed (npm run build)
//   2. playwright-core is installed (`npm i -D playwright-core`)
//   3. at least one browser is installed: `npx playwright install chromium`
//
// The script starts the dev server and shuts it down at the end.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

// playwright-core is imported lazily so tests can be skipped when it is absent.
async function loadPw() {
  try {
    return await import("playwright-core");
  } catch {
    console.warn("[e2e] playwright-core is not installed; tests skipped.");
    return null;
  }
}

const PORT = 5174;
const BASE = `http://localhost:${PORT}`;

let server;
let browser;

test.before(async () => {
  server = spawn("node", ["server/serve.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  // Wait until the server responds.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    await wait(100);
  }

  const pw = await loadPw();
  if (!pw) return;
  browser = await pw.chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
});

test("counter increments", async (t) => {
  if (!browser) return t.skip("playwright is not installed");
  const page = await browser.newPage();
  await page.goto(BASE);

  const btn = await page.waitForSelector("x-counter >>> button:has-text('+1')");
  await btn.click();
  await btn.click();
  await btn.click();

  const text = await page.locator("x-counter").first().innerText();
  assert.match(text, /Value:\s*3/);

  await page.close();
});

test("data-link navigation changes the view", async (t) => {
  if (!browser) return t.skip("playwright is not installed");
  const page = await browser.newPage();
  await page.goto(BASE);

  await page.click("a[href='/about']");
  await page.waitForSelector("x-about");
  const h2 = await page.locator("x-about").first().innerText();
  assert.match(h2, /About/);

  await page.close();
});

test("adding a todo shows it in the list", async (t) => {
  if (!browser) return t.skip("playwright is not installed");
  const page = await browser.newPage();
  await page.goto(BASE);

  await page.fill(
    "x-todos >>> input[placeholder='what to do...']",
    "write e2e",
  );
  await page.click("x-todos >>> button[type='submit']");

  const list = await page.locator("x-todos >>> ul").first().innerText();
  assert.match(list, /write e2e/);

  await page.close();
});
