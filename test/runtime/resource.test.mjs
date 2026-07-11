// Tests for resource() / mutation() / invalidate().
// No DOM: use a global fetch stub.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, flushSync } = await import("../../dist/src/signal.js");
const { resource, mutation, invalidate, jsonFetcher, HttpError } = await import(
  "../../dist/src/resource.js"
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
  assert.equal(r.data(), "cached/1");

  id.set(2);
  flushSync();
  await wait(0);
  assert.equal(calls, 2);
  assert.equal(r.data(), "cached/2");

  id.set(1);
  flushSync();
  await wait(0);
  assert.equal(calls, 2, "key '1' is already cached; no second request should happen");
  assert.equal(r.data(), "cached/1");
});

test("resource: staleTime zero refetches after in-flight deduplication", async () => {
  let calls = 0;
  const fetcher = async () => ++calls;
  const first = resource(() => "no-cache", fetcher);
  await wait(0);
  const second = resource(() => "no-cache", fetcher);
  await wait(0);
  assert.equal(first.data(), 1);
  assert.equal(second.data(), 2);
  assert.equal(calls, 2);
});

test("resource: concurrent resources with the same key share one in-flight fetch", async () => {
  let calls = 0;
  let resolveFetch;
  const fetcher = async (key) => {
    calls++;
    return await new Promise((resolve) => {
      resolveFetch = () => resolve({ key });
    });
  };

  const r1 = resource(() => "dedupe/shared", fetcher);
  const r2 = resource(() => "dedupe/shared", fetcher);

  assert.equal(calls, 1, "same in-flight key should issue one network call");
  assert.equal(r1.loading(), true);
  assert.equal(r2.loading(), true);

  resolveFetch();
  await wait(0);

  assert.deepEqual(r1.data(), { key: "dedupe/shared" });
  assert.deepEqual(r2.data(), { key: "dedupe/shared" });
  assert.equal(r1.loading(), false);
  assert.equal(r2.loading(), false);
});

test("resource: same key with different fetchers has isolated identity", async () => {
  let resolveFetch;
  let calls = 0;
  const firstFetcher = async () => {
    calls++;
    return await new Promise((resolve) => {
      resolveFetch = () => resolve("first");
    });
  };
  const secondFetcher = async () => {
    calls++;
    return "second";
  };

  const r1 = resource(() => "dedupe/collision", firstFetcher);
  const r2 = resource(() => "dedupe/collision", secondFetcher);
  assert.equal(calls, 2, "different fetchers must not share requests or values");

  resolveFetch();
  await wait(0);

  assert.equal(r1.data(), "first");
  assert.equal(r2.data(), "second");
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

  assert.equal(await r.refresh(), 2);
  assert.equal(calls, 2);
  assert.equal(r.data(), 2);
});

test("resource: invalidation reaches live resources without cached data", async () => {
  let calls = 0;
  const r = resource(() => "live/uncached", async () => ++calls);
  await wait(0);
  assert.equal(r.data(), 1);
  invalidate("live/*");
  await wait(0);
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
  assert.equal(r.data(), "inv/1");

  const m = mutation(
    async (n) => n + 1,
    { invalidates: ["inv/*"] },
  );
  await m.run(0);
  await wait(0);
  assert.equal(calls, 2, "after invalidate there should be a refetch");
  assert.equal(r.data(), "inv/1");
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
  assert.equal(r.data(), "posts/7");

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
  assert.equal(r.data(), "posts/7");
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

// ---------- Race condition: stale response must not overwrite fresh data ----------
//
// When the resource key changes rapidly (e.g. user types in a search input),
// an in-flight request for the OLD key may resolve AFTER a request for the
// NEW key has already completed. Without protection the stale response wins
// because it set data() last.
//
// resource() must guard against this two ways:
//   1) Abort the previous AbortController (works when the fetcher honors it).
//   2) Compare the request's captured key to lastKey on resolution (defensive
//      check for fetchers that ignore the AbortSignal).
//
// This test uses a fetcher that DELIBERATELY ignores the AbortSignal — it
// returns based on its own timer regardless of cancellation. Without the
// `key !== lastKey` guard, the slow stale resolution from key=1 would
// overwrite the fast fresh resolution from key=2.

test("resource: stale fetcher response does not overwrite fresh data on rapid key change", async () => {
  const id = signal(1);
  // Slow for key 1 (50ms), fast for key 2 (10ms). The fetcher ignores
  // the AbortSignal on purpose: this is the worst-case scenario for a
  // user-provided fetcher that does not propagate cancellation.
  const r = resource(
    () => `race/${id()}`,
    async (key) => {
      const ms = key === "race/1" ? 50 : 10;
      await wait(ms);
      return { from: key };
    },
  );

  await wait(0); // kick off key=1
  // Synchronously bump the key to 2 BEFORE key=1's fetch resolves.
  id.set(2);
  flushSync();

  // Wait long enough for BOTH fetches to finish (key=2 first @10ms,
  // then key=1 @50ms — the dangerous one).
  await wait(80);

  assert.deepEqual(
    r.data(),
    { from: "race/2" },
    "fresh result for key=2 must not be overwritten by the slower stale key=1 response",
  );
});

test("resource: rapid key thrash settles on the final key, not the slowest response", async () => {
  const id = signal(1);
  // Latencies chosen so that the FINAL key (3) is actually the SLOWEST,
  // and an earlier key (2) finishes the fastest. If resource() naively
  // wrote the first-arrived result, it would land on key=2.
  const latency = { 1: 30, 2: 5, 3: 25 };
  const r = resource(
    () => `thrash/${id()}`,
    async (key) => {
      const ms = latency[key.split("/")[1]];
      await wait(ms);
      return key;
    },
  );

  await wait(0);
  id.set(2);
  flushSync();
  await wait(0);
  id.set(3);
  flushSync();

  await wait(60);
  assert.equal(
    r.data(),
    "thrash/3",
    "data() must reflect the latest key, not the fastest in-flight response",
  );
});
