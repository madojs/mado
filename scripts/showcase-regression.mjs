// Browser regression for examples/showcase.
//
// Optional by design: regular `npm test` stays Node/linkedom-only. Run this
// when you want real browser confidence for routing, forms and Shadow DOM.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const PORT = Number(process.env.PORT ?? 5181);
const BASE = `http://localhost:${PORT}`;

async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    console.warn("[showcase-regression] playwright-core is not installed; skipped.");
    return null;
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* server not ready */
    }
    await wait(100);
  }
  throw new Error(`Server did not start at ${BASE}`);
}

const server = spawn("node", ["server/serve.mjs"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    EXAMPLE: "showcase",
    NO_HMR: "1",
  },
  stdio: "pipe",
});

let browser;
let chrome;
let tmpProfile;
try {
  await waitForServer();
  const pw = await loadPlaywright();
  if (pw) {
    try {
      browser = await pw.chromium.launch();
      const page = await browser.newPage();
      await runWithPage(page);
      await page.close();
    } catch (error) {
      console.warn(
        `[showcase-regression] Playwright Chromium could not start; falling back to system Chrome. ${error.message}`,
      );
      if (browser) await browser.close();
      browser = undefined;
      const result = await runWithChromeCdp();
      chrome = result.chrome;
      tmpProfile = result.tmpProfile;
    }
  } else {
    const result = await runWithChromeCdp();
    chrome = result.chrome;
    tmpProfile = result.tmpProfile;
  }
  console.log("[showcase-regression] passed");
} finally {
  if (browser) await browser.close();
  if (chrome) {
    chrome.kill("SIGTERM");
    await wait(300);
  }
  if (tmpProfile) {
    try {
      await rm(tmpProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
    } catch {
      /* best-effort cleanup */
    }
  }
  server.kill("SIGTERM");
}

async function expectSingle(page, selector) {
  const count = await page.locator(`#app ${selector}`).count();
  assert.equal(count, 1, `${selector} should be the only active page host`);
}

async function runWithPage(page) {
  await page.goto(BASE);
  await page.waitForSelector("x-hero");
  assert.equal(await page.locator("#app x-hero").count(), 1);

  await page.click("x-nav >>> a[href='/app/login']");
  await page.waitForSelector("x-login");
  await page.fill("x-login >>> input[name='email']", "anna@example.com");
  await page.fill("x-login >>> input[name='password']", "demo");
  await page.click("x-login >>> button[type='submit']");
  await page.waitForSelector("x-dashboard");
  await expectSingle(page, "x-dashboard");

  await page.click("x-app-layout a[href='/app/accounts']");
  await page.waitForSelector("x-accounts-list");
  await page.fill("x-accounts-list >>> input[type='search']", "Northwind");
  await page.waitForTimeout(350);
  await expectSingle(page, "x-accounts-list");

  await page.click("x-accounts-list >>> a[href='/app/accounts/new']");
  await page.waitForSelector("x-account-new");
  await page.fill("x-account-new >>> input[name='name']", "Browser Test Co");
  await page.fill("x-account-new >>> input[name='domain']", "browser.example");
  await page.fill("x-account-new >>> input[name='mrr']", "6200");
  await page.fill("x-account-new >>> textarea[name='notes']", "Created by browser regression.");
  await page.click("x-account-new >>> button[type='submit']");
  await page.waitForSelector("x-account-detail");
  await expectSingle(page, "x-account-detail");

  await page.click("x-account-detail >>> button:has-text('New deal')");
  await page.fill("x-account-detail >>> input[name='title']", "Browser pipeline");
  await page.fill("x-account-detail >>> input[name='value']", "88000");
  await page.fill("x-account-detail >>> textarea[name='notes']", "Created through modal regression.");
  await page.click("x-account-detail >>> button:has-text('Create deal')");
  await page.waitForTimeout(500);
  await expectSingle(page, "x-account-detail");

  await page.click("x-app-layout a[href='/app/deals']");
  await page.waitForSelector("x-deals-list");
  await expectSingle(page, "x-deals-list");

  const activeAppHosts = await page.locator(
    "#app x-dashboard,#app x-accounts-list,#app x-account-new,#app x-account-detail,#app x-deals-list,#app x-deal-detail,#app x-settings,#app x-login",
  ).count();
  assert.equal(activeAppHosts, 1);
}

async function runWithChromeCdp() {
  if (typeof WebSocket === "undefined") {
    console.warn("[showcase-regression] no WebSocket for CDP fallback; skipped.");
    process.exit(0);
  }
  const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9228);
  const chromeBin = process.env.CHROME_BIN ?? "google-chrome";
  const profile = await mkdtemp(join(tmpdir(), "mado-showcase-chrome-"));
  const chromeProc = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      BASE,
    ],
    { stdio: "ignore" },
  );
  chromeProc.on("error", () => {
    console.warn("[showcase-regression] google-chrome is not available; skipped.");
  });

  const wsUrl = await waitForCdp(debugPort);
  if (!wsUrl) {
    chromeProc.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true });
    console.warn("[showcase-regression] Chrome CDP did not start; skipped.");
    process.exit(0);
  }

  const cdp = await connectCdp(wsUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: BASE });
  await waitForCdpSelector(cdp, "x-hero");
  assert.equal(await cdpCount(cdp, "x-hero"), 1);

  await cdpClick(cdp, "x-nav >>> a[href='/app/login']");
  await waitForCdpSelector(cdp, "x-login");
  await cdpFill(cdp, "x-login >>> input[name='email']", "anna@example.com");
  await cdpFill(cdp, "x-login >>> input[name='password']", "demo");
  await cdpClick(cdp, "x-login >>> button[type='submit']");
  await waitForCdpSelector(cdp, "x-dashboard");
  assert.equal(await cdpCount(cdp, "x-dashboard"), 1);

  await cdpClick(cdp, "x-app-layout >>> a[href='/app/accounts']");
  await waitForCdpSelector(cdp, "x-accounts-list");
  await cdpFill(cdp, "x-accounts-list >>> input[type='search']", "Northwind");
  await wait(350);
  assert.equal(await cdpCount(cdp, "x-accounts-list"), 1);

  await cdpClick(cdp, "x-accounts-list >>> a[href='/app/accounts/new']");
  await waitForCdpSelector(cdp, "x-account-new");
  await cdpFill(cdp, "x-account-new >>> input[name='name']", "Browser Test Co");
  await cdpFill(cdp, "x-account-new >>> input[name='domain']", "browser.example");
  await cdpFill(cdp, "x-account-new >>> input[name='mrr']", "6200");
  await cdpFill(cdp, "x-account-new >>> textarea[name='notes']", "Created by browser regression.");
  await cdpClick(cdp, "x-account-new >>> button[type='submit']");
  await waitForCdpSelector(cdp, "x-account-detail");
  assert.equal(await cdpCount(cdp, "x-account-detail"), 1);

  await cdpClickText(cdp, "x-account-detail >>> button", "New deal");
  await cdpFill(cdp, "x-account-detail >>> input[name='title']", "Browser pipeline");
  await cdpFill(cdp, "x-account-detail >>> input[name='value']", "88000");
  await cdpFill(cdp, "x-account-detail >>> textarea[name='notes']", "Created through modal regression.");
  await cdpClickText(cdp, "x-account-detail >>> button", "Create deal");
  await wait(500);
  assert.equal(await cdpCount(cdp, "x-account-detail"), 1);

  await cdpClick(cdp, "x-app-layout >>> a[href='/app/deals']");
  await waitForCdpSelector(cdp, "x-deals-list");
  assert.equal(await cdpCount(cdp, "x-deals-list"), 1);
  const active = await cdpCount(
    cdp,
    "x-dashboard,x-accounts-list,x-account-new,x-account-detail,x-deals-list,x-deal-detail,x-settings,x-login",
  );
  assert.equal(active, 1);
  cdp.close();
  return { chrome: chromeProc, tmpProfile: profile };
}

async function waitForCdp(debugPort) {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
      for (const item of list) {
        if (item.type === "page" && item.webSocketDebuggerUrl) return item.webSocketDebuggerUrl;
      }
    } catch {
      /* not ready */
    }
    await wait(100);
  }
  return "";
}

function connectCdp(url) {
  const ws = new WebSocket(url);
  let seq = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  };
  return new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error("CDP websocket failed"));
    ws.onopen = () => {
      resolve({
        send(method, params = {}) {
          const id = seq++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
        },
        close() {
          ws.close();
        },
      });
    };
  });
}

function helperScript() {
  return `
(() => {
  window.__deepFind = (selector, root = document) => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll('*')) {
      if (!el.shadowRoot) continue;
      const found = window.__deepFind(selector, el.shadowRoot);
      if (found) return found;
    }
    return null;
  };
  window.__deepCount = (selector, root = document) => {
    let count = root.querySelectorAll(selector).length;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) count += window.__deepCount(selector, el.shadowRoot);
    }
    return count;
  };
  window.__pq = (path) => {
    let root = document;
    let node = null;
    for (const raw of path.split('>>>')) {
      const part = raw.trim();
      node = root === document ? window.__deepFind(part, root) : root.querySelector(part);
      if (!node) return null;
      root = node.shadowRoot || node;
    }
    return node;
  };
  window.__pqAllCount = (selector) => window.__deepCount(selector);
})();
`;
}

async function cdpEval(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Runtime.evaluate failed";
    throw new Error(detail);
  }
  return result.result?.value;
}

async function installHelper(cdp) {
  await cdpEval(cdp, helperScript());
}

async function waitForCdpSelector(cdp, selector) {
  await installHelper(cdp);
  for (let i = 0; i < 80; i++) {
    if (await cdpEval(cdp, `Boolean(window.__pq(${JSON.stringify(selector)}))`)) return;
    await wait(100);
  }
  const snapshot = await cdpEval(
    cdp,
    `JSON.stringify({ href: location.href, title: document.title, body: document.body.innerHTML.slice(0, 500) })`,
  );
  throw new Error(`Selector not found: ${selector}; page=${snapshot}`);
}

async function cdpClick(cdp, selector) {
  await installHelper(cdp);
  await cdpEval(cdp, `(() => {
    const el = window.__pq(${JSON.stringify(selector)});
    if (!el) throw new Error("missing ${selector}");
    el.click();
    return true;
  })()`);
}

async function cdpClickText(cdp, selector, text) {
  await installHelper(cdp);
  for (let i = 0; i < 80; i++) {
    const clicked = await cdpEval(cdp, `(() => {
      const rootPath = ${JSON.stringify(selector)};
      const parts = rootPath.split('>>>');
      let root = document;
      const last = parts.pop().trim();
      for (const raw of parts) {
        const part = raw.trim();
        const node = root === document ? window.__deepFind(part, root) : root.querySelector(part);
        if (!node) return false;
        root = node.shadowRoot || node;
      }
      const el = Array.from(root.querySelectorAll(last)).find((x) => x.textContent.includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (clicked) return;
    await wait(100);
  }
  throw new Error(`Text button not found: ${selector} ${text}`);
}

async function cdpFill(cdp, selector, value) {
  await installHelper(cdp);
  await cdpEval(cdp, `(() => {
    const el = window.__pq(${JSON.stringify(selector)});
    if (!el) throw new Error("missing ${selector}");
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  })()`);
}

async function cdpCount(cdp, selector) {
  await installHelper(cdp);
  return cdpEval(cdp, `window.__pqAllCount(${JSON.stringify(selector)})`);
}
