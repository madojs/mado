import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  collectDeclarationGraph,
  declarationSpecifiers,
} from "../../scripts/api-check.mjs";

const root = resolve(import.meta.dirname, "../..");
const distRoot = resolve(root, "dist/src");

test("public declaration graph follows re-exported API shapes", async () => {
  const graph = await collectDeclarationGraph(
    [resolve(distRoot, "index.d.ts")],
    distRoot,
  );
  const forms = graph.get(resolve(distRoot, "forms.d.ts"));

  assert.ok(forms, "root declaration graph includes the forms module");
  assert.match(forms, /setErrors\(errors: FormErrors<V>\): void;/);
  assert.ok(
    graph.has(resolve(distRoot, "signal.d.ts")),
    "transitive declaration imports are included",
  );
});

test("declaration scanning ignores import-like examples in comments", () => {
  const source = `
    /** Example: import("./not-public.js") */
    export type { FormApi } from "./forms.js";
  `;

  assert.deepEqual(declarationSpecifiers(source), ["./forms.js"]);
});

test("declaration graph handles cycles and every local declaration reference form", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "mado-api-contract-"));
  const declarations = join(fixture, "dist");
  await mkdir(declarations);
  await Promise.all([
    writeFile(
      join(declarations, "index.d.ts"),
      [
        '/// <reference path="./reference.d.ts" />',
        'export type { FormApi } from "./forms.js";',
        'export type Lazy = import("./lazy.js").Lazy;',
        'import Alias = require("./alias.js");',
      ].join("\n"),
    ),
    writeFile(
      join(declarations, "forms.d.ts"),
      'import type { Signal } from "./signal.js";\nexport interface FormApi { value: Signal<string>; }\n',
    ),
    writeFile(
      join(declarations, "signal.d.ts"),
      'export type { FormApi } from "./forms.js";\nexport interface Signal<T> { (): T; }\n',
    ),
    writeFile(join(declarations, "lazy.d.ts"), "export interface Lazy {}\n"),
    writeFile(join(declarations, "alias.d.ts"), "export interface Alias {}\n"),
    writeFile(join(declarations, "reference.d.ts"), "export interface Reference {}\n"),
  ]);

  try {
    const graph = await collectDeclarationGraph(
      [join(declarations, "index.d.ts")],
      declarations,
    );
    assert.deepEqual(
      [...graph.keys()].map((path) => path.slice(declarations.length + 1)).sort(),
      ["alias.d.ts", "forms.d.ts", "index.d.ts", "lazy.d.ts", "reference.d.ts", "signal.d.ts"],
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("declaration graph rejects imports outside the package boundary", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "mado-api-boundary-"));
  const declarations = join(fixture, "dist");
  await mkdir(declarations);
  await writeFile(join(declarations, "index.d.ts"), 'export * from "../outside.js";\n');
  await writeFile(join(fixture, "outside.d.ts"), "export interface Outside {}\n");

  try {
    await assert.rejects(
      collectDeclarationGraph([join(declarations, "index.d.ts")], declarations),
      /escaped its public package boundary/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
