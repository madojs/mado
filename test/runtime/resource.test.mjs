// Tests for resource() / mutation() / invalidate().
// No DOM: use a global fetch stub.

import test from "node:test";
import assert from "node:assert/strict";

const { signal, flushSync } = await import("../../dist/src/signal.js");
const {
  resource,
  mutation,
  invalidate,
  jsonFetcher,
  HttpError,
  _testHooks,
} = await import("../../dist/src/resource.js");

// ----- helpers -----

function wait(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

test("resource: retains the previous key's data while loading by default", async () => {
  const id = signal(1);
  let resolveSecond;
  const r = resource(
    () => `retain/${id()}`,
    (key) =>
      key === "retain/1"
        ? Promise.resolve(key)
        : new Promise((resolve) => {
            resolveSecond = resolve;
          }),
  );

  await wait(0);
  assert.equal(r.data(), "retain/1");
  id.set(2);
  flushSync();
  assert.equal(r.loading(), true);
  assert.equal(r.data(), "retain/1");

  resolveSecond("retain/2");
  await wait(0);
  assert.equal(r.data(), "retain/2");
});

test("resource: retainPreviousData false clears only on a reactive key change", async () => {
  const id = signal(1);
  let resolveFirst;
  let resolveSecond;
  const r = resource(
    () => `private/${id()}`,
    (key) =>
      new Promise((resolve) => {
        if (key === "private/1") resolveFirst = resolve;
        else resolveSecond = resolve;
      }),
    { initialData: "server seed", retainPreviousData: false },
  );

  assert.equal(r.data(), "server seed", "the initial request preserves initialData");
  resolveFirst("private/1");
  await wait(0);
  assert.equal(r.data(), "private/1");

  id.set(2);
  flushSync();
  assert.equal(r.data(), undefined, "the old key's projection is removed immediately");
  assert.equal(r.loading(), true);
  resolveSecond("private/2");
  await wait(0);
  assert.equal(r.data(), "private/2");
});

test("resource: retainPreviousData false applies fresh cached destination data synchronously", async () => {
  const id = signal(1);
  let calls = 0;
  const fetcher = async (key) => {
    calls++;
    return key;
  };
  const r = resource(() => `private-cache/${id()}`, fetcher, {
    staleTime: 60_000,
    retainPreviousData: false,
  });

  await wait(0);
  id.set(2);
  flushSync();
  await wait(0);
  assert.equal(r.data(), "private-cache/2");

  id.set(1);
  flushSync();
  assert.equal(r.data(), "private-cache/1");
  assert.equal(calls, 2, "returning to the cached key does not fetch again");
});

test("resource: retainPreviousData false keeps data for same-key refresh and invalidation", async () => {
  let calls = 0;
  let resolveNext;
  const fetcher = async () => {
    calls++;
    if (calls === 1) return "version 1";
    return await new Promise((resolve) => {
      resolveNext = resolve;
    });
  };
  const r = resource(() => "same-key/private", fetcher, {
    staleTime: 60_000,
    retainPreviousData: false,
  });

  await wait(0);
  const refresh = r.refresh();
  assert.equal(r.data(), "version 1");
  resolveNext("version 2");
  await refresh;
  await wait(0);
  assert.equal(r.data(), "version 2");

  invalidate("same-key/private");
  assert.equal(r.data(), "version 2");
  resolveNext("version 3");
  await wait(0);
  assert.equal(r.data(), "version 3");
});

test("resource: refresh observes a changed reactive key before its effect flushes", async () => {
  const id = signal(1);
  let resolveSecond;
  const r = resource(
    () => `refresh-key/${id()}`,
    (key) =>
      key === "refresh-key/1"
        ? Promise.resolve(key)
        : new Promise((resolve) => {
            resolveSecond = resolve;
          }),
    { retainPreviousData: false },
  );

  await wait(0);
  id.set(2);
  const refreshed = r.refresh();
  assert.equal(r.data(), undefined);
  resolveSecond("refresh-key/2");
  await refreshed;
  await wait(0);
  assert.equal(r.data(), "refresh-key/2");
});

test("resource: retainPreviousData false does not restore old data after a new-key error", async () => {
  const id = signal(1);
  const r = resource(
    () => `private-error/${id()}`,
    async (key) => {
      if (key.endsWith("/2")) throw new Error("denied");
      return key;
    },
    { retainPreviousData: false },
  );

  await wait(0);
  assert.equal(r.data(), "private-error/1");
  id.set(2);
  flushSync();
  assert.equal(r.data(), undefined);
  await wait(0);
  assert.equal(r.error()?.message, "denied");
  assert.equal(r.data(), undefined);
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

test("resource: synchronous fetcher throws become ordinary rejected requests", async () => {
  let calls = 0;
  let r;
  assert.doesNotThrow(() => {
    r = resource(() => "sync/error", () => {
      calls++;
      throw new Error(`sync boom ${calls}`);
    });
  });

  assert.equal(r.loading(), true);
  await wait(0);
  assert.equal(r.loading(), false);
  assert.equal(r.error()?.message, "sync boom 1");

  const refreshed = r.refresh();
  assert.ok(refreshed instanceof Promise);
  assert.equal(r.loading(), true);
  await assert.rejects(refreshed, /sync boom 2/);
  assert.equal(r.loading(), false);
  assert.equal(r.error()?.message, "sync boom 2");
});

test("resource: a synchronous invalidation failure does not skip other resources", async () => {
  let failingCalls = 0;
  let healthyCalls = 0;
  const failing = resource(() => "sync/invalidate", () => {
    failingCalls++;
    throw new Error("expected sync failure");
  });
  const healthy = resource(
    () => "sync/invalidate",
    async () => ++healthyCalls,
  );

  await wait(0);
  assert.equal(failing.error()?.message, "expected sync failure");
  assert.equal(healthy.data(), 1);

  assert.doesNotThrow(() => invalidate("sync/invalidate"));
  await wait(0);
  assert.equal(failingCalls, 2);
  assert.equal(healthyCalls, 2);
  assert.equal(failing.error()?.message, "expected sync failure");
  assert.equal(healthy.data(), 2);
});

test("resource: one invalidation generation is shared but refresh generations are explicit", async () => {
  const requests = [];
  const fetcher = (_key, signal) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    return request.promise;
  };
  const first = resource(() => "generation/shared", fetcher, {
    staleTime: 60_000,
  });
  const second = resource(() => "generation/shared", fetcher, {
    staleTime: 60_000,
  });

  assert.equal(requests.length, 1, "initial consumers share one request");
  requests[0].resolve("seed");
  await wait(0);

  invalidate("generation/shared");
  assert.equal(
    requests.length,
    2,
    "all live consumers join one forced invalidation request",
  );
  requests[1].resolve("invalidated");
  await wait(0);
  assert.equal(first.data(), "invalidated");
  assert.equal(second.data(), "invalidated");

  const firstRefresh = first.refresh();
  const secondRefresh = second.refresh();
  assert.equal(
    requests.length,
    4,
    "each explicit refresh starts its own forced generation",
  );
  requests[2].resolve("first refresh");
  requests[3].resolve("second refresh");
  await Promise.all([firstRefresh, secondRefresh]);
});

test("resource: only the newest forced generation commits the shared cache", async () => {
  const requests = [];
  const fetcher = (_key, signal) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    return request.promise;
  };
  const first = resource(() => "generation/cache", fetcher, {
    staleTime: 60_000,
  });
  const second = resource(() => "generation/cache", fetcher, {
    staleTime: 60_000,
  });

  requests[0].resolve("seed");
  await wait(0);

  const older = first.refresh();
  const newer = second.refresh();
  assert.equal(requests.length, 3);

  requests[2].resolve("new");
  await newer;
  requests[1].resolve("old");
  await older;
  await wait(0);

  const reader = resource(() => "generation/cache", fetcher, {
    staleTime: 60_000,
  });
  assert.equal(reader.data(), "new");
  assert.equal(
    requests.length,
    3,
    "a displaced response cannot overwrite the authoritative cache",
  );
});

test("resource: a displaced request remains abortable by its own consumer", async () => {
  const requests = [];
  const fetcher = (_key, signal) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    return request.promise;
  };
  const first = resource(() => "generation/abort", fetcher, {
    staleTime: 60_000,
  });
  const second = resource(() => "generation/abort", fetcher, {
    staleTime: 60_000,
  });

  requests[0].resolve("seed");
  await wait(0);
  const displaced = first.refresh();
  const current = second.refresh();
  assert.equal(requests[1].signal.aborted, false);

  first.dispose();
  assert.equal(
    requests[1].signal.aborted,
    true,
    "releasing a displaced entry still aborts its controller",
  );
  requests[1].resolve("ignored");
  requests[2].resolve("current");
  await Promise.all([displaced, current]);
});

test("resource: last release unlinks an ignore-abort request and fences its late settlement", async () => {
  const requests = [];
  const fetcher = (_key, signal) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    return request.promise;
  };
  const key = "release/ignore-abort";
  const first = resource(() => key, fetcher, { staleTime: Infinity });

  assert.equal(_testHooks.hasFetcherState(fetcher), true);
  assert.equal(_testHooks.pendingSize(fetcher), 1);
  first.dispose();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(
    _testHooks.hasFetcherState(fetcher),
    false,
    "an ownerless never-settling request must not retain its fetcher state",
  );

  const replacement = resource(() => key, fetcher, { staleTime: Infinity });
  assert.equal(requests.length, 2);
  requests[0].resolve("retired late result");
  await wait(0);
  assert.equal(
    _testHooks.hasFetcherState(fetcher),
    true,
    "late cleanup from an old state must not delete a replacement state",
  );
  assert.equal(_testHooks.pendingSize(fetcher), 1);
  assert.equal(replacement.data(), undefined);

  requests[1].resolve("authoritative result");
  await wait(0);
  const reader = resource(() => key, fetcher, { staleTime: Infinity });
  assert.equal(reader.data(), "authoritative result");
  assert.equal(requests.length, 2, "the retired late result cannot revive or replace cache");

  replacement.dispose();
  reader.dispose();
  invalidate(key);
});

test("resource: synchronous reentrant refresh cannot overwrite the newer in-flight owner", async () => {
  const requests = [];
  let resourceRef;
  let innerRefresh;
  const key = "generation/reentrant";
  const fetcher = (_key, signal) => {
    const request = { ...deferred(), signal };
    requests.push(request);
    if (requests.length === 2) innerRefresh = resourceRef.refresh();
    return request.promise;
  };
  resourceRef = resource(() => key, fetcher, { staleTime: 60_000 });
  requests[0].resolve("seed");
  await wait(0);

  const outerRefresh = resourceRef.refresh();
  assert.equal(requests.length, 3);
  assert.equal(
    requests[1].signal.aborted,
    true,
    "the displaced outer refresh releases its placeholder on unwind",
  );
  assert.equal(requests[2].signal.aborted, false);
  assert.equal(_testHooks.pendingSize(fetcher), 1);

  requests[2].resolve("newer result");
  await innerRefresh;
  requests[1].resolve("older result");
  await outerRefresh;
  await wait(0);

  assert.equal(resourceRef.data(), "newer result");
  const reader = resource(() => key, fetcher, { staleTime: 60_000 });
  assert.equal(reader.data(), "newer result");
  assert.equal(requests.length, 3);

  resourceRef.dispose();
  reader.dispose();
  invalidate(key);
});

test("resource: settled generations are pruned while long-lived cache keeps the fetcher state", async () => {
  const anchorKey = "generation-pruning/anchor";
  const fetcher = async (key) => key;
  const anchor = resource(() => anchorKey, fetcher, { staleTime: Infinity });
  await wait(0);
  assert.equal(_testHooks.hasFetcherState(fetcher), true);
  assert.equal(_testHooks.generationSize(fetcher), 0);

  for (let index = 0; index < 25; index++) {
    const transient = resource(
      () => `generation-pruning/transient-${index}`,
      fetcher,
    );
    await wait(0);
    transient.dispose();
    assert.equal(
      _testHooks.generationSize(fetcher),
      0,
      `settled transient generation ${index} must not accumulate metadata`,
    );
  }
  assert.equal(
    _testHooks.cacheInfo(fetcher, anchorKey)?.retentionTime,
    Infinity,
    "the long-lived cache entry still owns the fetcher state",
  );

  anchor.dispose();
  invalidate(anchorKey);
});

test("resource: staleTime is per reader and zero never erases a positive cache", async () => {
  for (const order of ["zero-first", "positive-first"]) {
    let calls = 0;
    const fetcher = async () => `${order}:${++calls}`;
    const createZero = () =>
      resource(() => `stale-order/${order}`, fetcher, { staleTime: 0 });
    const createPositive = () =>
      resource(() => `stale-order/${order}`, fetcher, {
        staleTime: 60_000,
      });

    const pair =
      order === "zero-first"
        ? [createZero(), createPositive()]
        : [createPositive(), createZero()];
    await wait(0);
    assert.equal(calls, 1, `${order}: initial in-flight request is shared`);
    assert.equal(pair[0].data(), `${order}:1`);
    assert.equal(pair[1].data(), `${order}:1`);

    const zeroReader = createZero();
    await wait(0);
    assert.equal(calls, 2, `${order}: staleTime zero performs a fresh read`);
    assert.equal(zeroReader.data(), `${order}:2`);

    const positiveReader = createPositive();
    assert.equal(positiveReader.data(), `${order}:2`);
    assert.equal(
      calls,
      2,
      `${order}: the zero reader must not delete the shared positive cache`,
    );
  }
});

test("resource: a longer cache reader promotes retention without refreshing the data timestamp", async () => {
  const key = "stale-promotion/shared";
  let calls = 0;
  const fetcher = async () => `result ${++calls}`;
  const short = resource(() => key, fetcher, { staleTime: 20 });
  await wait(0);
  const original = _testHooks.cacheInfo(fetcher, key);
  assert.ok(original);
  await wait(5);

  const long = resource(() => key, fetcher, { staleTime: 80 });
  const promoted = _testHooks.cacheInfo(fetcher, key);
  assert.equal(long.data(), "result 1");
  assert.equal(calls, 1);
  assert.equal(promoted?.timestamp, original.timestamp);
  assert.equal(promoted?.retentionTime, 80);

  await wait(25);
  const afterOriginalExpiry = resource(() => key, fetcher, { staleTime: 80 });
  assert.equal(afterOriginalExpiry.data(), "result 1");
  assert.equal(
    calls,
    1,
    "promotion keeps the entry beyond its shorter original retention",
  );

  short.dispose();
  long.dispose();
  afterOriginalExpiry.dispose();
  invalidate(key);
});

test("resource: an empty key is a disabled sentinel in every operation", async () => {
  const key = signal("");
  let calls = 0;
  const fetcher = async (activeKey) => {
    calls++;
    return activeKey;
  };
  const cacheBefore = _testHooks.cacheSize();
  const r = resource(() => key(), fetcher, { initialData: "seed" });

  assert.equal(r.key(), "");
  assert.equal(r.loading(), false);
  await wait(0);
  assert.equal(calls, 0, "initial empty key does not fetch");

  invalidate("");
  await wait(0);
  assert.equal(calls, 0, "empty-key resources ignore invalidation");

  r.mutate("local only");
  assert.equal(r.data(), "local only");
  assert.equal(
    _testHooks.cacheSize(),
    cacheBefore,
    "mutating a disabled resource does not create an empty-key cache entry",
  );

  await assert.rejects(
    r.refresh(),
    /empty string disables the resource/,
  );
  assert.equal(r.loading(), false);
  assert.equal(r.error(), null);
  assert.equal(calls, 0);

  key.set("enabled");
  flushSync();
  await wait(0);
  assert.equal(calls, 1);
  assert.equal(r.data(), "enabled");

  key.set("");
  flushSync();
  invalidate("");
  await wait(0);
  assert.equal(calls, 1, "transitioning back to empty stays disabled");
  assert.equal(r.data(), "enabled", "default retention keeps the last value");
});

test("resource: empty-key mutate and invalidation are safe before effect flush", async () => {
  const key = signal("transition/active");
  let calls = 0;
  const fetcher = async () => `server ${++calls}`;
  const r = resource(() => key(), fetcher, { staleTime: 60_000 });
  await wait(0);
  assert.equal(r.data(), "server 1");

  key.set("");
  r.mutate("local while disabled");
  const cachedReader = resource(() => "transition/active", fetcher, {
    staleTime: 60_000,
  });
  assert.equal(
    cachedReader.data(),
    "server 1",
    "an unflushed empty key must not let mutate poison the previous key cache",
  );
  assert.equal(calls, 1);
  cachedReader.dispose();

  invalidate("transition/active");
  await wait(0);
  assert.equal(
    calls,
    1,
    "invalidation reads the current empty key instead of refetching the last key",
  );
  assert.equal(r.loading(), false);
  assert.equal(r.data(), "local while disabled");
});

test("resource: disabling a pending key aborts and suppresses its late result", async () => {
  const key = signal("");
  let request;
  const r = resource(
    () => key(),
    (_activeKey, signal) => {
      request = { ...deferred(), signal };
      return request.promise;
    },
    { retainPreviousData: false },
  );

  key.set("pending");
  flushSync();
  assert.equal(r.loading(), true);
  key.set("");
  flushSync();
  assert.equal(request.signal.aborted, true);
  assert.equal(r.loading(), false);
  assert.equal(r.data(), undefined);

  request.resolve("late");
  await wait(0);
  assert.equal(r.data(), undefined);
  assert.equal(r.error(), null);
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
