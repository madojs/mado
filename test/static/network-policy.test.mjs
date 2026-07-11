import test from "node:test";
import assert from "node:assert/strict";

const { _testHooks } = await import("../../scripts/static/browser.mjs");

test("static capture network policy allows only capture-origin and inline URLs", () => {
  const origin = "http://127.0.0.1:4173";
  assert.equal(_testHooks.isCaptureAllowedUrl(`${origin}/assets/app.js`, origin), true);
  assert.equal(_testHooks.isCaptureAllowedUrl("data:image/svg+xml,ok", origin), true);
  assert.equal(_testHooks.isCaptureAllowedUrl("blob:http://127.0.0.1:4173/id", origin), true);
  assert.equal(_testHooks.isCaptureAllowedUrl("https://api.example.test/data", origin), false);
  assert.equal(_testHooks.isCaptureAllowedUrl("https://cdn.example.test/font.woff2", origin), false);
});
