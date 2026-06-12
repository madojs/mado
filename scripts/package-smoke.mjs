#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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

  await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { html, signal } from "@madojs/mado";
        import "@madojs/mado/devtools.js";
        if (typeof html !== "function" || typeof signal !== "function") {
          throw new Error("public root import failed");
        }
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

  await run("npx", ["mado", "init", "smoke-app", "--starter", "minimal"], {
    cwd: installRoot,
    env: { ...process.env, MADO_PACKAGE_SPEC: tarball },
  });

  const appRoot = join(installRoot, "smoke-app");
  await run("npm", ["install"], { cwd: appRoot });
  await run("npm", ["run", "release"], { cwd: appRoot });

  console.log(`[package-smoke] ok ${basename(tarball)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
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
