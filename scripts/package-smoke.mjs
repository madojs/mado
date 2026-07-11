#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = await mkdtemp(join(tmpdir(), "mado-package-smoke-"));
let tarball = "";

try {
  const packed = await exec("npm", ["pack", "--silent"], { cwd: repoRoot });
  tarball = resolve(repoRoot, packed.stdout.trim().split(/\s+/).at(-1) ?? "");
  if (!tarball) throw new Error("[package-smoke] npm pack did not return a tarball");

  const installRoot = join(tempRoot, "installed");
  await mkdir(installRoot, { recursive: true });
  await run("npm", ["install", tarball], { cwd: installRoot });

  // Public-API surface smoke: prove the published tarball exposes the
  // root entry, the devtools side-effect import and the Vite plugin,
  // while still hiding internal subpaths behind `exports`.
  await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { html, signal, routeUrl, appBase } from "@madojs/mado";
        import "@madojs/mado/devtools.js";
        import { mado } from "@madojs/mado/vite";
        if (typeof html !== "function" || typeof signal !== "function") {
          throw new Error("public root import failed");
        }
        if (typeof routeUrl !== "function" || typeof appBase !== "string") {
          throw new Error("routing helpers missing from public root");
        }
        if (typeof mado !== "function") throw new Error("vite plugin import failed");
        try {
          await import("@madojs/mado/lifecycle.js");
          throw new Error("internal lifecycle subpath unexpectedly resolved");
        } catch (err) {
          if (err?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw err;
        }
      `,
    ],
    { cwd: installRoot },
  );

  // We exercise BOTH published starters end-to-end:
  //
  //   smoke-universal — `mado init` (default), npm install, typecheck,
  //                     release. This is the path the README quick-start
  //                     points new users to; if it ever breaks for a
  //                     published tarball the first-run experience is
  //                     broken.
  //
  //   smoke-modular   — `mado init --starter modular`, npm install,
  //                     `mado new module`, release. Long-lived apps
  //                     deploy this shape; the `mado new` generator
  //                     also lives here.
  //
  // Each run uses MADO_SITE so static routes resolve canonical URLs,
  // and points the starter at the freshly packed tarball through
  // MADO_PACKAGE_SPEC so package.json doesn't reference an unpublished
  // version.

  await smokeStarter({
    label: "universal",
    appName: "smoke-universal",
    initArgs: ["mado", "init", "smoke-universal"],
    after: async (appRoot) => {
      await run("npm", ["run", "typecheck"], { cwd: appRoot });
      await run("npm", ["run", "release"], {
        cwd: appRoot,
        env: { ...process.env, MADO_SITE: "https://package-smoke.test" },
      });
    },
    installRoot,
    tarball,
  });

  await smokeStarter({
    label: "modular",
    appName: "smoke-modular",
    initArgs: ["mado", "init", "smoke-modular", "--starter", "modular"],
    after: async (appRoot) => {
      await run("npm", ["run", "new", "--", "module", "smoke"], {
        cwd: appRoot,
      });
      await run("npm", ["run", "typecheck"], { cwd: appRoot });
      await run("npm", ["run", "release"], {
        cwd: appRoot,
        env: { ...process.env, MADO_SITE: "https://package-smoke.test" },
      });
    },
    installRoot,
    tarball,
  });

  console.log(`[package-smoke] ok ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
}

async function smokeStarter({ label, appName, initArgs, after, installRoot, tarball }) {
  console.log(`[package-smoke] === ${label} starter ===`);
  await run("npx", initArgs, {
    cwd: installRoot,
    env: { ...process.env, MADO_PACKAGE_SPEC: tarball },
  });
  const appRoot = join(installRoot, appName);
  const gitignore = await readFile(join(appRoot, ".gitignore"), "utf8");
  for (const required of ["node_modules", "dist", "out", ".cache", ".env", "*.log"]) {
    if (!gitignore.split(/\r?\n/).includes(required)) {
      throw new Error(`[package-smoke] ${label} .gitignore is missing ${required}`);
    }
  }
  await run("npm", ["install"], { cwd: appRoot });
  await after(appRoot);
}

async function run(cmd, args, options) {
  console.log(`[package-smoke] ${cmd} ${args.join(" ")}`);
  try {
    await exec(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    throw err;
  }
}
