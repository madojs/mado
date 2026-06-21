// useForm() tests.

import test from "node:test";
import assert from "node:assert/strict";

// DOM stub is needed because forms.ts checks `el instanceof HTMLInputElement`.
const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
globalThis.window = w;
globalThis.document = w.document;
globalThis.HTMLInputElement = w.HTMLInputElement ?? class {};
globalThis.HTMLSelectElement = w.HTMLSelectElement ?? class {};
globalThis.HTMLTextAreaElement = w.HTMLTextAreaElement ?? class {};

const { flushSync } = await import("../../dist/src/signal.js");
const { useForm } = await import("../../dist/src/forms.js");

// Helper: creates a real input through linkedom, so instanceof passes.
function input(attrs = {}) {
  const el = document.createElement("input");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (attrs.value !== undefined) el.value = String(attrs.value);
  if (attrs.type !== undefined) el.type = attrs.type;
  if (attrs.name !== undefined) el.name = attrs.name;
  return el;
}

function event(type, target) {
  return { type, target, preventDefault() {} };
}

function inputEvent(name, value, type = "text") {
  return event("input", input({ name, value, type }));
}
function blurEvent(name) {
  return event("blur", input({ name }));
}

test("useForm: defaults + initial isValid with required", () => {
  const f = useForm({
    name: { required: true, default: "" },
    email: { required: true, type: "email", default: "" },
  });
  assert.equal(f.isValid(), false);
  assert.equal(f.values().name, "");
});

test("useForm: onInput updates values, onBlur updates touched", () => {
  const f = useForm({ name: { required: true, default: "" } });
  f.onInput(inputEvent("name", "Vasya"));
  flushSync();
  assert.equal(f.values().name, "Vasya");
  assert.equal(f.touched().name, undefined);

  f.onBlur(blurEvent("name"));
  flushSync();
  assert.equal(f.touched().name, true);
});

test("useForm: email validation", () => {
  const f = useForm({ email: { required: true, type: "email", default: "" } });
  f.onInput(inputEvent("email", "x"));
  flushSync();
  assert.equal(f.errors().email, "invalid email");

  f.onInput(inputEvent("email", "a@b.c"));
  flushSync();
  assert.equal(f.errors().email, undefined);
  assert.equal(f.isValid(), true);
});

test("useForm: number with min/max", () => {
  const f = useForm({
    age: { required: true, type: "number", min: 18, max: 99, default: "" },
  });
  f.onInput(inputEvent("age", "10", "number"));
  flushSync();
  assert.equal(f.errors().age, "minimum 18");

  f.onInput(inputEvent("age", "150", "number"));
  flushSync();
  assert.equal(f.errors().age, "maximum 99");

  f.onInput(inputEvent("age", "42", "number"));
  flushSync();
  assert.equal(f.errors().age, undefined);
});

test("useForm: custom validate", () => {
  const f = useForm(
    { name: { required: true, default: "" } },
    {
      validate: (v) =>
        v.name === "admin" ? { name: "forbidden" } : null,
    },
  );
  f.onInput(inputEvent("name", "admin"));
  flushSync();
  assert.equal(f.errors().name, "forbidden");

  f.onInput(inputEvent("name", "Vasya"));
  flushSync();
  assert.equal(f.errors().name, undefined);
});

test("useForm: onSubmit calls handler only when valid", async () => {
  let called = 0;
  const f = useForm({ name: { required: true, default: "" } });
  const submit = f.onSubmit(async () => {
    called++;
  });

  // Invalid: handler is not called.
  submit(event("submit", null));
  assert.equal(called, 0);

  // Now valid.
  f.setField("name", "ok");
  flushSync();
  submit(event("submit", null));
  // Wait a tick so submitting resets.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(called, 1);
});

test("useForm: reset returns to defaults", () => {
  const f = useForm({ name: { default: "X" } });
  f.setField("name", "Y");
  flushSync();
  assert.equal(f.values().name, "Y");
  f.reset();
  flushSync();
  assert.equal(f.values().name, "X");
});

test("useForm: async field validator updates errors and ignores stale results", async () => {
  const f = useForm({
    username: {
      default: "",
      validateAsync: async (value) => {
        await new Promise((r) =>
          setTimeout(r, value === "taken" ? 20 : 1),
        );
        return value === "taken" ? "already taken" : null;
      },
    },
  });

  f.setField("username", "taken");
  const slow = f.validateField("username");
  f.setField("username", "free");
  const fast = f.validateField("username");

  assert.equal(f.validating(), true);
  assert.equal(await fast, true);
  assert.equal(await slow, true);
  flushSync();

  assert.equal(f.errors().username, undefined);
  assert.equal(f.validating(), false);
});

test("useForm: onSubmit waits for validateAsync and blocks invalid submit", async () => {
  let called = 0;
  const f = useForm(
    { email: { required: true, default: "a@b.c" } },
    {
      validateAsync: async (values) => {
        await new Promise((r) => setTimeout(r, 1));
        return values.email === "blocked@b.c"
          ? { email: "blocked" }
          : null;
      },
    },
  );
  const submit = f.onSubmit(async () => {
    called++;
  });

  f.setField("email", "blocked@b.c");
  flushSync();
  submit(event("submit", null));
  assert.equal(f.validating(), true);
  await new Promise((r) => setTimeout(r, 5));
  flushSync();

  assert.equal(called, 0);
  assert.equal(f.errors().email, "blocked");
  assert.equal(f.validating(), false);

  f.setField("email", "ok@b.c");
  flushSync();
  submit(event("submit", null));
  await new Promise((r) => setTimeout(r, 5));
  flushSync();

  assert.equal(called, 1);
  assert.equal(f.errors().email, undefined);
});

test("useForm: field arrays use path names and wildcard validation", () => {
  const f = useForm({
    items: { default: [] },
    "items.*.title": { required: true },
  });
  const items = f.array("items");

  items.append({ title: "First" });
  items.append({ title: "" });
  flushSync();

  assert.equal(items.path(1, "title"), "items.1.title");
  assert.equal(f.values().items[0].title, "First");
  assert.equal(f.errors()["items.1.title"], "required field");

  f.onInput(inputEvent(items.path(1, "title"), "Second"));
  flushSync();
  assert.equal(f.values().items[1].title, "Second");
  assert.equal(f.errors()["items.1.title"], undefined);

  items.move(1, 0);
  flushSync();
  assert.equal(f.values().items[0].title, "Second");
  assert.equal(f.values().items[1].title, "First");

  items.remove(1);
  flushSync();
  assert.equal(f.values().items.length, 1);
  assert.equal(f.values().items[0].title, "Second");
});
