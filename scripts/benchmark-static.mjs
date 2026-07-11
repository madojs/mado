import { performance } from "node:perf_hooks";

import { mapConcurrent } from "./static/browser.mjs";

for (const routes of [10, 100, 1_000]) {
  const input = Array.from({ length: routes }, (_, index) => index);
  const start = performance.now();
  await mapConcurrent(input, 4, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return value;
  });
  const elapsed = performance.now() - start;
  console.log(`[static-benchmark] ${String(routes).padStart(4)} routes: ${elapsed.toFixed(1)} ms scheduler baseline`);
}
