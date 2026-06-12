#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd();
const ticketsDir = join(root, "examples", "tickets");

const llms = await read("llms.txt");
assertIncludes(llms, "This is NOT React", "llms.txt must keep the React warning");
assertIncludes(llms, "Canonical CRUD pattern", "llms.txt must keep the CRUD recipe");
assertIncludes(llms, "resource()", "llms.txt must document resource()");
assertIncludes(llms, "mutation", "llms.txt must document mutation()");
assertIncludes(llms, "useForm", "llms.txt must document useForm()");

const files = await collectTs(ticketsDir);
const code = (await Promise.all(files.map((file) => read(file)))).join("\n");
const routes = await read(join(ticketsDir, "routes.ts"));

for (const route of ['"/"', '"/tickets"', '"/tickets/new"', '"/tickets/:id"', '"*"']) {
  assertIncludes(routes, route, `tickets routes must include ${route}`);
}

for (const api of [
  "component(",
  "html`",
  "signal(",
  "computed(",
  "resource(",
  "mutation(",
  "invalidates",
  "queryParam(",
  "each(",
  "useForm(",
]) {
  assertIncludes(code, api, `tickets example must exercise ${api}`);
}

const forbidden = [
  /\buseState\s*\(/,
  /\buseEffect\s*\(/,
  /\$state\b/,
  /\bref\s*\(/,
  /from\s+["']react["']/,
  /class\s+\w+\s+extends\s+HTMLElement/,
  /<>\s*$/,
  /(^|[^?.\w-])disabled=\$\{/,
  /(^|[^?.\w-])checked=\$\{/,
];

for (const pattern of forbidden) {
  if (pattern.test(code)) {
    throw new Error(`[llm-smoke] forbidden generated pattern: ${pattern}`);
  }
}

await run(process.execPath, ["scripts/cli.mjs", "build"]);
await run(process.execPath, ["--test", "test/tickets-smoke.test.mjs"]);

console.log("[llm-smoke] ok examples/tickets follows llms.txt and passes smoke");

async function collectTs(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const file = join(dir, entry);
    const s = await stat(file);
    if (s.isDirectory()) out.push(...await collectTs(file));
    else if (file.endsWith(".ts")) out.push(file);
  }
  return out.sort();
}

async function read(file) {
  return readFile(file, "utf8");
}

function assertIncludes(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`[llm-smoke] ${message}`);
}

async function run(cmd, args) {
  console.log(`[llm-smoke] ${cmd} ${args.join(" ")}`);
  try {
    await exec(cmd, args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    throw err;
  }
}
