import test from "node:test";
import assert from "node:assert/strict";

const { useForm } = await import("../../dist/src/forms.js");

function control(overrides = {}) {
  return {
    tagName: "INPUT",
    name: "field",
    type: "text",
    value: "",
    valueAsNumber: Number.NaN,
    checked: false,
    multiple: false,
    files: null,
    validityOk: true,
    validationMessage: "",
    checkValidity() {
      return this.validityOk;
    },
    ...overrides,
  };
}

function form(elements) {
  return {
    tagName: "FORM",
    elements,
    reports: 0,
    resets: 0,
    reportValidity() {
      this.reports++;
      return elements.every((item) => item.checkValidity?.() ?? true);
    },
    reset() {
      this.resets++;
    },
  };
}

function eventFor(target, currentTarget = null) {
  return {
    target,
    currentTarget,
    composedPath: () => [target, currentTarget].filter(Boolean),
    preventDefault() {},
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("useForm: initial values, dirty state, setField and reset", () => {
  const f = useForm({ initial: { name: "Ada", tags: ["web"] } });
  assert.deepEqual(f.values(), { name: "Ada", tags: ["web"] });
  assert.equal(f.dirty(), false);

  f.setField("name", "Grace");
  assert.equal(f.values().name, "Grace");
  assert.equal(f.dirty(), true);

  f.reset();
  assert.deepEqual(f.values(), { name: "Ada", tags: ["web"] });
  assert.equal(f.dirty(), false);
});

test("useForm: input coercion follows native control types", () => {
  const f = useForm({
    initial: { age: 0, enabled: false, roles: [], colour: "" },
  });
  const age = control({ name: "age", type: "number", value: "42", valueAsNumber: 42 });
  const enabled = control({ name: "enabled", type: "checkbox", checked: true });
  const admin = control({ name: "roles", type: "checkbox", checked: true, value: "admin" });
  const editor = control({ name: "roles", type: "checkbox", checked: true, value: "editor" });
  const colour = control({ name: "colour", type: "radio", checked: true, value: "blue" });
  const host = form([age, enabled, admin, editor, colour]);
  for (const item of host.elements) item.form = host;

  f.onInput(eventFor(age, host));
  f.onInput(eventFor(enabled, host));
  f.onInput(eventFor(admin, host));
  f.onInput(eventFor(colour, host));

  assert.deepEqual(f.values(), {
    age: 42,
    enabled: true,
    roles: ["admin", "editor"],
    colour: "blue",
  });
});

test("useForm: native validationMessage is the source of constraint errors", async () => {
  const email = control({
    name: "email",
    value: "bad",
    validityOk: false,
    validationMessage: "Enter an email address",
  });
  const host = form([email]);
  email.form = host;
  const f = useForm({ initial: { email: "" } });

  assert.equal(await f.validate(host), false);
  assert.equal(f.errors().email, "Enter an email address");
  assert.equal(f.isValid(), false);

  email.validityOk = true;
  email.validationMessage = "";
  email.value = "ok@example.test";
  f.onInput(eventFor(email, host));
  assert.equal(f.values().email, "ok@example.test");
  assert.equal(f.errors().email, undefined);
  assert.equal(f.isValid(), true);
});

test("useForm: async validation is cancellable and stale results are ignored", async () => {
  const slow = deferred();
  const f = useForm({
    initial: { username: "" },
    validate: async (values) => {
      if (values.username === "taken") {
        await slow.promise;
        return { username: "already taken" };
      }
      return null;
    },
  });

  f.setField("username", "taken");
  const stale = f.validate();
  f.setField("username", "free");
  const fresh = f.validate();
  assert.equal(await fresh, true);
  slow.resolve();
  assert.equal(await stale, false);
  assert.equal(f.errors().username, undefined);
  assert.equal(f.validating(), false);
});

test("useForm: reset aborts validation and preserves the new baseline", async () => {
  const gate = deferred();
  const f = useForm({
    initial: { name: "old" },
    validate: async () => {
      await gate.promise;
      return { name: "stale" };
    },
  });
  const pending = f.validate();
  f.reset({ name: "new" });
  gate.resolve();
  assert.equal(await pending, false);
  assert.deepEqual(f.values(), { name: "new" });
  assert.deepEqual(f.errors(), {});
  assert.equal(f.validating(), false);
});

test("useForm: submit validates, marks touched and tracks concurrent handlers", async () => {
  const gate = deferred();
  const email = control({ name: "email", value: "ok@example.test" });
  const host = form([email]);
  email.form = host;
  const f = useForm({ initial: { email: "ok@example.test" } });
  let submits = 0;
  const submit = f.onSubmit(async () => {
    submits++;
    await gate.promise;
  });

  submit(eventFor(host, host));
  await tick();
  assert.equal(submits, 1);
  assert.equal(f.submitting(), true);
  assert.equal(f.touched().email, true);
  gate.resolve();
  await tick();
  assert.equal(f.submitting(), false);
});
