import test from "node:test";
import assert from "node:assert/strict";

const { mado } = await import("../../dist/src/vite/index.js");

test("Vite bridge contains only portable static metadata", () => {
  const plugin = mado({ site: "https://example.test" });
  const config = plugin.config({}, { command: "build", mode: "production" });
  assert.equal(config.define.__MADO_DEVTOOLS__, "false");
  plugin.configResolved({
    base: "/docs/",
    build: { assetsDir: "assets", outDir: "/private/machine/path/out" },
  });
  const assets = [];
  plugin.generateBundle.call({ emitFile: (asset) => assets.push(asset) });
  const bridge = JSON.parse(assets[0].source);
  assert.deepEqual(bridge, {
    site: "https://example.test",
    base: "/docs/",
  });
  assert.doesNotMatch(assets[0].source, /private|outDir|assetsDir/);
});
