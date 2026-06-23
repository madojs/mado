import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");

async function runCli(cwd, args) {
  await exec(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

test("mado new scaffolds canonical modular starter file forms", async () => {
  const root = mkdtempSync(join(tmpdir(), "mado-new-"));
  try {
    // Generators that touch src/modules/<name>/ are only meaningful in
    // the modular starter — the universal starter ships src/pages and
    // src/components instead and rejects modular-only kinds.
    await runCli(root, ["init", "app", "--starter", "modular"]);
    const app = join(root, "app");

    await runCli(app, ["new", "module", "reports"]);
    await runCli(app, ["new", "page", "reports/pages/report-list"]);
    await runCli(app, ["new", "connector", "reports/api/stripe"]);
    await runCli(app, ["new", "resource", "reports/data/reports"]);
    await runCli(app, ["new", "service", "reports/cart"]);
    await runCli(app, ["new", "form", "reports/report"]);
    await runCli(app, ["new", "component", "reports/components/status-badge"]);
    await runCli(app, ["new", "component", "reports/components/badge"]);
    await runCli(app, ["new", "guard", "reports/reports"]);
    await runCli(app, ["new", "layout", "reports-shell"]);

    const files = [
      "src/modules/reports/reports.types.ts",
      "src/modules/reports/reports.routes.ts",
      "src/modules/reports/reports.public.ts",
      "src/modules/reports/pages/report-list.page.ts",
      "src/modules/reports/api/stripe.connector.ts",
      "src/modules/reports/data/reports.resource.ts",
      "src/modules/reports/cart.service.ts",
      "src/modules/reports/report.form.ts",
      "src/modules/reports/components/status-badge.component.ts",
      "src/modules/reports/components/badge.component.ts",
      "src/modules/reports/reports.guard.ts",
      "src/layouts/reports-shell.layout.ts",
    ];

    for (const file of files) {
      assert.ok(existsSync(join(app, file)), `${file} should exist`);
    }

    const connector = readFileSync(
      join(app, "src/modules/reports/api/stripe.connector.ts"),
      "utf8",
    );
    assert.match(connector, /from "\.\.\/\.\.\/\.\.\/shared\/http\/http-client"/);

    const plainComponent = readFileSync(
      join(app, "src/modules/reports/components/badge.component.ts"),
      "utf8",
    );
    assert.match(plainComponent, /component\(\n  "x-badge"/);

    const page = readFileSync(
      join(app, "src/modules/reports/pages/report-list.page.ts"),
      "utf8",
    );
    assert.match(page, /view: \(\) => \{/);
    assert.match(page, /\/\/ 1\. LOCAL STATE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mado new is context-aware in the universal starter", async () => {
  const root = mkdtempSync(join(tmpdir(), "mado-new-uni-"));
  try {
    // Default starter is the universal layout (src/pages, src/components).
    await runCli(root, ["init", "app"]);
    const app = join(root, "app");

    // `page` and `component` write into the universal locations.
    await runCli(app, ["new", "page", "settings"]);
    await runCli(app, ["new", "component", "callout"]);

    assert.ok(
      existsSync(join(app, "src/pages/settings.page.ts")),
      "page generator must target src/pages/ in the universal starter",
    );
    assert.ok(
      existsSync(join(app, "src/components/callout.component.ts")),
      "component generator must target src/components/ in the universal starter",
    );
    assert.equal(
      existsSync(join(app, "src/modules")),
      false,
      "universal starter never creates src/modules/",
    );

    // Modular-only kinds (`module`, `connector`, `resource`, `service`,
    // `form`, `guard`) are refused with a non-zero exit so users do not
    // accidentally pollute the universal layout.
    await assert.rejects(
      runCli(app, ["new", "module", "billing"]),
      "expected `mado new module` to fail under universal starter",
    );
    await assert.rejects(
      runCli(app, ["new", "resource", "billing/data/invoices"]),
      "expected `mado new resource` to fail under universal starter",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
