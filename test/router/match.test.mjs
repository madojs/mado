import test from "node:test";
import assert from "node:assert/strict";

const { compile, matchRoute, patternToRegex } = await import(
  "../../dist/src/router/match.js"
);

const handler = () => ({ _mado: true, strings: [""], values: [] });

test("route matcher treats literal regex punctuation literally", () => {
  const cpp = compile("/docs/c++", handler);
  const version = compile("/v1.0/:name", handler);

  assert.ok(matchRoute("/docs/c++", [cpp]));
  assert.equal(matchRoute("/docs/c--", [cpp]), null);
  assert.ok(matchRoute("/v1.0/guide", [version]));
  assert.equal(matchRoute("/v1x0/guide", [version]), null);
  assert.equal(patternToRegex("/files/(draft)").test("/files/(draft)"), true);
  assert.equal(patternToRegex("/files/(draft)").test("/files/draft"), false);
});

test("route matcher still captures and decodes params", () => {
  const route = compile("/users/:id/files/:name", handler);
  const match = matchRoute("/users/a%2Bb/files/report.pdf", [route]);
  assert.deepEqual(match?.params, { id: "a+b", name: "report.pdf" });
});
