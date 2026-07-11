import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(ROOT, "scripts/cli.mjs");
const REQUIRE_BROWSER = process.env.MADO_REQUIRE_BROWSER === "1";

test("modular starter supports keyboard login, guarded billing, mutation and logout", { timeout: 60_000 }, async (t) => {
  const browserName = process.env.MADO_BROWSER_NAME ?? "chromium";
  const playwright = await import("playwright-core");
  const browserType = playwright[browserName];
  assert.ok(browserType, `unknown Playwright browser: ${browserName}`);

  let browser;
  try {
    browser = await launch(browserName, browserType);
  } catch (error) {
    if (REQUIRE_BROWSER) throw error;
    t.skip(`${browserName} is not installed`);
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "mado-modular-browser-"));
  const app = join(root, "app");
  cpSync(join(ROOT, "starters/modular"), app, { recursive: true });
  mkdirSync(join(app, "node_modules/@madojs"), { recursive: true });
  symlinkSync(ROOT, join(app, "node_modules/@madojs/mado"));
  symlinkSync(join(ROOT, "node_modules/vite"), join(app, "node_modules/vite"));

  const port = await availablePort();
  const server = spawn(
    process.execPath,
    [CLI, "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: app,
      detached: process.platform !== "win32",
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));

  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  try {
    const origin = `http://127.0.0.1:${port}`;
    await waitForServer(origin, server, () => output);

    await page.goto(`${origin}/billing/invoices`);
    await page.waitForURL("**/login");
    await page.getByLabel("Email").fill("demo@mado.dev");
    await page.getByLabel("Password").fill("demo123");
    await page.getByLabel("Password").press("Enter");
    await page.waitForURL(origin + "/");

    await page.getByRole("link", { name: "billing" }).click();
    await page.waitForURL("**/billing/invoices");
    await page.getByRole("link", { name: "INV-1001", exact: true }).click();
    await page.waitForURL("**/billing/invoices/in_1001");
    await page.getByRole("button", { name: "Pay now" }).click();
    await page.getByText("paid", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("link", { name: "Sign in" }).waitFor();
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL("**/login");

    assert.deepEqual(browserErrors, [], browserErrors.join("\n"));
  } finally {
    await page.close();
    await browser.close();
    if (process.platform === "win32") server.kill("SIGTERM");
    else if (server.pid) process.kill(-server.pid, "SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    server.stdout.destroy();
    server.stderr.destroy();
    rmSync(root, { recursive: true, force: true });
  }
});

async function launch(name, browserType) {
  if (name !== "chromium") return browserType.launch({ headless: true });
  if (process.env.MADO_BROWSER_PATH) {
    return browserType.launch({ executablePath: process.env.MADO_BROWSER_PATH, headless: true });
  }
  if (process.env.MADO_BROWSER_CHANNEL) {
    return browserType.launch({ channel: process.env.MADO_BROWSER_CHANNEL, headless: true });
  }
  try {
    return await browserType.launch({ headless: true });
  } catch (error) {
    try {
      return await browserType.launch({ channel: "chrome", headless: true });
    } catch {
      throw error;
    }
  }
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(origin, child, output) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`dev server exited ${child.exitCode}\n${output()}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`dev server did not start\n${output()}`);
}
