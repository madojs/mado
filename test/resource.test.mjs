// Tests for resource() / mutation() / invalidate().
// No DOM: use a global fetch stub.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, flushSync } = await import("../dist/src/signal.js");
const { resource, mutation, invalidate, jsonFetcher, HttpError } = await import(
  "../dist/src/resource.js"
);

// ----- helpers -----

function wait(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

test("resource: loads data when the key changes", async () => {
  let calls = 0;
  const id = signal(1);

  const r = resource(
    () => `users/${id()}`,
    async (key) => {
      calls++;
      return { key };
    },
  );

  await wait(0);
  assert.deepEqual(r.data(), { key: "users/1" });
  assert.equal(calls, 1);

  id.set(2);
  flushSync();
  await wait(0);
  assert.deepEqual(r.data(), { key: "users/2" });
  assert.equal(calls, 2);
});

test("resource: cache is reused when returning to an old key", async () => {
  let calls = 0;
  const id = signal(1);
  const r = resource(
    () => `cached/${id()}`,
    async (key) => {
      calls++;
      return key;
    },
    { staleTime: 60_000 },
  );
  await wait(0);
  assert.equal(calls, 1);

  id.set(2);
  flushSync();
  await wait(0);
  assert.equal(calls, 2);

  id.set(1);
  flushSync();
  await wait(0);
  assert.equal(calls, 2, "key '1' is already cached; no second request should happen");
});

test("resource: refresh forces a request", async () => {
  let calls = 0;
  const r = resource(
    () => "force",
    async () => {
      calls++;
      return calls;
    },
    { staleTime: 60_000 },
  );
  await wait(0);
  assert.equal(r.data(), 1);

  r.refresh();
  await wait(0);
  assert.equal(calls, 2);
  assert.equal(r.data(), 2);
});

test("resource: mutate replaces data locally", async () => {
  const r = resource(
    () => "mut",
    async () => ({ value: 1 }),
  );
  await wait(0);
  assert.deepEqual(r.data(), { value: 1 });

  r.mutate((prev) => ({ value: prev.value + 41 }));
  assert.deepEqual(r.data(), { value: 42 });
});

test("resource: error lands in .error()", async () => {
  const r = resource(
    () => "err",
    async () => {
      throw new Error("boom");
    },
  );
  await wait(0);
  assert.equal(r.error()?.message, "boom");
  assert.equal(r.data(), undefined);
});

test("mutation: run + invalidate invalidates a resource", async () => {
  const id = signal(1);
  let calls = 0;
  const r = resource(
    () => `inv/${id()}`,
    async (key) => {
      calls++;
      return key;
    },
    { staleTime: 60_000 },
  );
  await wait(0);
  assert.equal(calls, 1);

  const m = mutation(
    async (n) => n + 1,
    { invalidates: ["inv/*"] },
  );
  await m.run(0);
  await wait(0);
  assert.equal(calls, 2, "after invalidate there should be a refetch");
});

test("mutation: loading/error/data signals", async () => {
  const m = mutation(async (n) => {
    if (n < 0) throw new Error("neg");
    return n * 2;
  });

  const p = m.run(3);
  // loading is true immediately.
  assert.equal(m.loading(), true);
  await p;
  assert.equal(m.loading(), false);
  assert.equal(m.data(), 6);
  assert.equal(m.error(), null);

  await assert.rejects(() => m.run(-1));
  assert.equal(m.loading(), false);
  assert.equal(m.error()?.message, "neg");
});

test("jsonFetcher: parses JSON and throws on !ok", async () => {
  // Replace global fetch.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === "/ok") {
      return new Response(JSON.stringify({ x: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("nope", { status: 500, statusText: "boom" });
  };

  try {
    const f = jsonFetcher();
    const data = await f("/ok", new AbortController().signal);
    assert.deepEqual(data, { x: 1 });

    await assert.rejects(() => f("/bad", new AbortController().signal), {
      message: /HTTP 500/,
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("jsonFetcher: HttpError contains status / url / parsed body (JSON)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ errors: { email: "taken" } }), {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: { "content-type": "application/json" },
    });

  try {
    const f = jsonFetcher();
    try {
      await f("/api/users", new AbortController().signal);
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof HttpError, "expected HttpError");
      assert.equal(err.status, 422);
      assert.equal(err.url, "/api/users");
      assert.deepEqual(err.body, { errors: { email: "taken" } });
      assert.equal(err.name, "HttpError");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("jsonFetcher: HttpError falls back to text for non-JSON responses", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Internal Server Error", {
      status: 500,
      statusText: "Server Error",
      headers: { "content-type": "text/plain" },
    });

  try {
    const f = jsonFetcher();
    try {
      await f("/api/x", new AbortController().signal);
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 500);
      assert.equal(err.body, "Internal Server Error");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("mutation: invalidates can be a function of result and arguments", async () => {
  const id = signal(7);
  let calls = 0;
  const r = resource(
    () => `posts/${id()}`,
    async (key) => {
      calls++;
      return key;
    },
    { staleTime: 60_000 },
  );
  await wait(0);
  assert.equal(calls, 1);

  const m = mutation(
    async (args) => ({ id: args.postId, ok: true }),
    {
      invalidates: (result, args) => [
        `posts/${result.id}`,
        `feed/${args.userId}/*`,
      ],
    },
  );
  await m.run({ postId: 7, userId: 1 });
  await wait(0);
  assert.equal(calls, 2, "after dynamic invalidation there should be a refetch");
});

test("mutation: invalidates function that throws does not fail the mutation", async () => {
  const m = mutation(
    async () => "ok",
    {
      invalidates: () => {
        throw new Error("oops");
      },
    },
  );
  // The mutation should succeed; invalidation errors are best effort.
  const result = await m.run(undefined);
  assert.equal(result, "ok");
  assert.equal(m.data(), "ok");
  assert.equal(m.error(), null);
});
