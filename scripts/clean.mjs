import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = process.argv.includes("--dist-only") ? ["dist"] : ["dist", "out"];
for (const target of targets) {
  await rm(resolve(root, target), { recursive: true, force: true });
}
