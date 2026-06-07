#!/usr/bin/env node
import { execSync } from "node:child_process";

function sh(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function safe(command) {
  try {
    return sh(command);
  } catch {
    return "";
  }
}

const tag = process.env.GITHUB_REF_NAME || safe("git describe --tags --exact-match") || "HEAD";
const previous = safe(`git describe --tags --abbrev=0 ${tag}^`);
const range = previous ? `${previous}..${tag}` : tag;
const log = safe(`git log --format=%s ${range}`);

const groups = [
  ["Features", /^feat(?:\(.+\))?:\s+(.+)/],
  ["Fixes", /^fix(?:\(.+\))?:\s+(.+)/],
  ["Documentation", /^docs(?:\(.+\))?:\s+(.+)/],
  ["Tests", /^test(?:\(.+\))?:\s+(.+)/],
  ["CI", /^ci(?:\(.+\))?:\s+(.+)/],
  ["Maintenance", /^(?:chore|refactor)(?:\(.+\))?:\s+(.+)/],
];

const notes = new Map(groups.map(([name]) => [name, []]));
const other = [];

for (const line of log.split("\n").map((item) => item.trim()).filter(Boolean)) {
  let matched = false;
  for (const [name, pattern] of groups) {
    const match = line.match(pattern);
    if (match) {
      notes.get(name).push(match[1]);
      matched = true;
      break;
    }
  }
  if (!matched) other.push(line);
}

console.log(`# ${tag}`);
console.log("");
if (previous) console.log(`Changes since ${previous}.`);
else console.log("First public release.");
console.log("");

for (const [name] of groups) {
  const items = notes.get(name);
  if (!items.length) continue;
  console.log(`## ${name}`);
  console.log("");
  for (const item of items) console.log(`- ${item}`);
  console.log("");
}

if (other.length) {
  console.log("## Other");
  console.log("");
  for (const item of other) console.log(`- ${item}`);
  console.log("");
}
