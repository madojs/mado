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

const { flushSync } = await import("../dist/src/signal.js");
const { useForm } = await import("../dist/src/forms.js");

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
