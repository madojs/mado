import test from "node:test";
import assert from "node:assert/strict";

const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
globalThis.window = w;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.customElements = w.customElements;

const {
  html,
  instantiate,
  render,
  unmount,
} = await import("../../dist/src/html/template.js");
const {
  classMap,
  ref,
} = await import("../../dist/src/html/bindings.js");
const {
  flushSync,
  signal,
} = await import("../../dist/src/signal.js");
const { _setTemplateOwner, _setTemplatePostCommit } = await import(
  "../../dist/src/html/template-types.js"
);

function connectedRoot() {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

function removeRoot(root) {
  unmount(root);
  root.remove();
}

function collectErrorMessages(error) {
  if (error instanceof AggregateError) {
    return error.errors.flatMap(collectErrorMessages);
  }
  return [error instanceof Error ? error.message : String(error)];
}

test("ref commits after insertion and the complete binding pass", () => {
  const root = connectedRoot();
  const observations = [];

  render(
    html`
      <section
        ref=${ref((element) => {
          if (!element) return;
          observations.push({
            connected: element.isConnected,
            ready: element.getAttribute("data-ready"),
            child: element.querySelector("span")?.getAttribute("data-child"),
          });
        })}
        data-ready=${"yes"}
      >
        <span data-child=${"bound"}></span>
      </section>
    `,
    root,
  );

  assert.deepEqual(observations, [
    { connected: true, ready: "yes", child: "bound" },
  ]);
  removeRoot(root);
});

test("instantiate keeps refs pending until an explicit post-insertion commit", () => {
  const calls = [];
  const instance = instantiate(
    html`<input ref=${ref((element) => calls.push(element?.isConnected ?? null))}>`,
  );

  assert.deepEqual(calls, []);
  document.body.append(instance.fragment);
  assert.deepEqual(calls, []);

  instance.commit();
  instance.commit();
  assert.deepEqual(calls, [true], "commit is idempotent");

  instance.dispose();
  instance.dispose();
  assert.deepEqual(calls, [true, null], "dispose detaches exactly once");
});

test("internal post-commit work runs only after a successful live commit", async () => {
  const calls = [];
  const result = html`<p>ready</p>`;
  _setTemplatePostCommit(result, () => calls.push("committed"));
  const instance = instantiate(result);

  document.body.append(instance.fragment);
  instance.commit();
  assert.deepEqual(calls, [], "post-commit work stays outside commit stack");
  await Promise.resolve();
  assert.deepEqual(calls, ["committed"]);
  instance.dispose();
});

test("failed template commit cancels internal post-commit work", async () => {
  const calls = [];
  const result = html`<button
    ref=${ref((element) => {
      if (element) throw new Error("commit failed");
    })}
  ></button>`;
  _setTemplatePostCommit(result, () => calls.push("committed"));
  const instance = instantiate(result);
  document.body.append(instance.fragment);

  assert.throws(() => instance.commit(), /commit failed/);
  await Promise.resolve();
  assert.deepEqual(calls, [], "rolled-back candidates never acknowledge commit");
});

test("failed same-template update does not acknowledge either rollback candidate", async () => {
  const root = connectedRoot();
  const calls = [];
  const view = (label, callback) => html`
    <button data-label=${label} ref=${ref(callback)}>${label}</button>
  `;
  const current = view("current", () => undefined);
  _setTemplatePostCommit(current, () => calls.push("current"));
  render(current, root);

  const failed = view("failed", (element) => {
    if (element) throw new Error("candidate failed");
  });
  _setTemplatePostCommit(failed, () => calls.push("failed"));
  assert.throws(() => render(failed, root), /candidate failed/);
  await Promise.resolve();

  assert.deepEqual(
    calls,
    ["current"],
    "the last successful commit survives an immediate failed candidate",
  );
  removeRoot(root);
});

test("nested and keyed refs inherit the connected owner commit boundary", async () => {
  const { each } = await import("../../dist/src/each.js");
  const root = connectedRoot();
  const observations = [];
  const firstRef = ref((element) => {
    if (element) observations.push(["nested", element.isConnected]);
  });
  const itemRef = ref((element) => {
    if (element) observations.push(["each", element.isConnected]);
  });

  render(
    html`
      <main>
        ${html`<button ref=${firstRef}>nested</button>`}
        ${each(
          [{ id: 1, itemRef }],
          (item) => item.id,
          (item) => html`<span ref=${item.itemRef}>item</span>`,
        )}
      </main>
    `,
    root,
  );

  assert.deepEqual(observations, [
    ["nested", true],
    ["each", true],
  ]);
  removeRoot(root);
});

test("refs created by a later reactive child update commit while connected", () => {
  const root = connectedRoot();
  const visible = signal(false);
  const observations = [];
  const directive = ref((element) => {
    observations.push(element ? element.isConnected : null);
  });

  render(
    html`<main>${() =>
      visible() ? html`<button ref=${directive}>now</button>` : null}</main>`,
    root,
  );
  assert.deepEqual(observations, []);

  visible.set(true);
  flushSync();
  assert.deepEqual(observations, [true]);

  visible.set(false);
  flushSync();
  assert.deepEqual(observations, [true, null]);
  removeRoot(root);
});

test("a failed reactive child emission stays subscribed and later recovers", () => {
  const root = connectedRoot();
  const value = signal("before");
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    render(
      html`<p>${() =>
        value() === "broken"
          ? classMap({ invalid: true })
          : value()}</p>`,
      root,
    );

    value.set("broken");
    flushSync();
    assert.equal(root.querySelector("p")?.textContent, "before");

    value.set("after");
    flushSync();
    assert.equal(root.querySelector("p")?.textContent, "after");
    assert.ok(
      errors.some((args) => String(args[0]).includes("effect-run")),
      "the failed emission is still reported",
    );
  } finally {
    console.error = originalError;
    removeRoot(root);
  }
});

test("unchanged refs, listeners, and reactive bindings do not churn", () => {
  const root = connectedRoot();
  const value = signal("one");
  const calls = [];
  let getterRuns = 0;
  const callback = (element) => {
    calls.push(element ? "attach" : "detach");
    if (element) return () => calls.push("cleanup");
  };
  const handler = () => {};
  const reactiveValue = () => {
    getterRuns++;
    return value();
  };
  const view = (label) => html`
    <button ref=${ref(callback)} @click=${handler}>
      ${reactiveValue}
      <span>${label}</span>
    </button>
  `;

  render(view("A"), root);
  const button = root.querySelector("button");
  let added = 0;
  let removed = 0;
  const nativeAdd = button.addEventListener;
  const nativeRemove = button.removeEventListener;
  button.addEventListener = function (...args) {
    added++;
    return nativeAdd.apply(this, args);
  };
  button.removeEventListener = function (...args) {
    removed++;
    return nativeRemove.apply(this, args);
  };

  render(view("B"), root);

  assert.deepEqual(calls, ["attach"]);
  assert.equal(getterRuns, 1, "an unchanged reactive slot stays subscribed");
  assert.equal(added, 0, "the unchanged listener is not re-added");
  assert.equal(removed, 0, "the unchanged listener is not removed");
  assert.equal(root.querySelector("span")?.textContent, "B");

  value.set("two");
  flushSync();
  assert.equal(getterRuns, 2);
  assert.match(button.textContent, /two/);

  removeRoot(root);
  assert.deepEqual(calls, ["attach", "cleanup", "detach"]);
});

test("an initial binding error rolls back effects, DOM, and pending refs", () => {
  const root = connectedRoot();
  const source = signal("value");
  const refCalls = [];

  assert.throws(
    () =>
      render(
        html`
          <div ref=${ref((element) => refCalls.push(element))}>
            ${() => source()}
            ${classMap({ invalid: true })}
          </div>
        `,
        root,
      ),
    /classMap directive cannot be used in child position/,
  );

  source.set("next");
  flushSync();
  assert.equal(root.childNodes.length, 0);
  assert.deepEqual(refCalls, [], "a never-committed ref receives no callbacks");
  root.remove();
});

test("a ref commit error removes the new tree and rolls back prior refs", () => {
  const root = connectedRoot();
  const calls = [];
  const first = ref((element) => {
    calls.push(element ? "first:attach" : "first:detach");
    if (element) return () => calls.push("first:cleanup");
  });
  const broken = ref((element) => {
    calls.push(element ? "broken:attach" : "broken:detach");
    if (element) throw new Error("broken ref");
  });

  assert.throws(
    () => render(html`<div ref=${first}></div><span ref=${broken}></span>`, root),
    /broken ref/,
  );

  assert.equal(root.childNodes.length, 0);
  assert.deepEqual(calls, [
    "first:attach",
    "broken:attach",
    "broken:detach",
    "first:cleanup",
    "first:detach",
  ]);
  root.remove();
});

test("a ref directive can reconnect after its failed commit rolls back closure state", () => {
  const root = connectedRoot();
  const calls = [];
  let retainedElement = null;
  let rejectNextAttach = true;
  const directive = ref((element) => {
    if (!element) {
      calls.push("detach");
      retainedElement = null;
      return;
    }

    calls.push("attach");
    retainedElement = element;
    if (rejectNextAttach) {
      rejectNextAttach = false;
      throw new Error("reject first attach");
    }
  });
  const view = () => html`<button ref=${directive}>ready</button>`;

  assert.throws(() => render(view(), root), /reject first attach/);
  assert.equal(root.childNodes.length, 0, "the failed tree is removed");
  assert.equal(retainedElement, null, "the null branch restores closure state");
  assert.deepEqual(calls, ["attach", "detach"]);

  render(view(), root);
  const button = root.querySelector("button");
  assert.ok(button?.isConnected);
  assert.equal(button.textContent, "ready");
  assert.equal(retainedElement, button);
  assert.deepEqual(calls, ["attach", "detach", "attach"]);

  removeRoot(root);
  assert.equal(retainedElement, null);
  assert.deepEqual(calls, ["attach", "detach", "attach", "detach"]);
});

test("a failed different-template replacement preserves the mounted owner", () => {
  const root = connectedRoot();
  const calls = [];
  const mounted = ref((element) => {
    calls.push(element ? "mounted:attach" : "mounted:detach");
  });
  const broken = ref((element) => {
    calls.push(element ? "broken:attach" : "broken:detach");
    if (element) throw new Error("replacement failed");
  });

  render(html`<article ref=${mounted}>stable</article>`, root);
  const article = root.querySelector("article");

  assert.throws(
    () => render(html`<aside ref=${broken}>broken</aside>`, root),
    /replacement failed/,
  );

  assert.equal(root.querySelector("article"), article);
  assert.equal(root.querySelector("aside"), null);
  assert.deepEqual(calls, [
    "mounted:attach",
    "broken:attach",
    "broken:detach",
  ]);

  removeRoot(root);
  assert.deepEqual(calls, [
    "mounted:attach",
    "broken:attach",
    "broken:detach",
    "mounted:detach",
  ]);
});

test("a failed update restores all earlier bindings and remains usable", () => {
  const root = connectedRoot();
  const stableRefCalls = [];
  const stableRef = ref((element) => {
    stableRefCalls.push(element ? "attach" : "detach");
  });
  const view = (state) => html`
    <article ref=${stableRef} data-state=${state.attr}>
      ${state.child}
    </article>
  `;

  render(view({ attr: "before", child: "before" }), root);
  const article = root.querySelector("article");

  assert.throws(
    () =>
      render(
        view({
          attr: "broken",
          child: classMap({ invalid: true }),
        }),
        root,
      ),
    /classMap directive cannot be used in child position/,
  );

  assert.equal(root.querySelector("article"), article);
  assert.equal(article.getAttribute("data-state"), "before");
  assert.equal(article.textContent.trim(), "before");
  assert.deepEqual(stableRefCalls, ["attach"]);

  render(view({ attr: "after", child: "after" }), root);
  assert.equal(article.getAttribute("data-state"), "after");
  assert.equal(article.textContent.trim(), "after");
  assert.deepEqual(stableRefCalls, ["attach"]);

  removeRoot(root);
  assert.deepEqual(stableRefCalls, ["attach", "detach"]);
});

test("a failed update commit restores the previous ref and attribute", () => {
  const root = connectedRoot();
  const calls = [];
  const good = ref((element) => {
    calls.push(element ? "good:attach" : "good:detach");
    if (element) return () => calls.push("good:cleanup");
  });
  const broken = ref((element) => {
    calls.push(element ? "broken:attach" : "broken:detach");
    if (element) throw new Error("update ref failed");
  });
  const view = (state, directive) =>
    html`<button data-state=${state} ref=${directive}></button>`;

  render(view("before", good), root);

  assert.throws(
    () => render(view("broken", broken), root),
    /update ref failed/,
  );

  const button = root.querySelector("button");
  assert.equal(button.getAttribute("data-state"), "before");
  assert.deepEqual(calls, [
    "good:attach",
    "good:cleanup",
    "good:detach",
    "broken:attach",
    "broken:detach",
    "good:attach",
  ]);

  removeRoot(root);
  assert.deepEqual(calls, [
    "good:attach",
    "good:cleanup",
    "good:detach",
    "broken:attach",
    "broken:detach",
    "good:attach",
    "good:cleanup",
    "good:detach",
  ]);
});

test("nested cleanup errors do not skip later cleanup or leave owned DOM", () => {
  const root = connectedRoot();
  const calls = [];
  const first = ref((element) => {
    if (!element) {
      calls.push("first:detach");
      return;
    }
    return () => {
      calls.push("first:cleanup");
      throw new Error("first cleanup failed");
    };
  });
  const second = ref((element) => {
    if (!element) {
      calls.push("second:detach");
      return;
    }
    return () => {
      calls.push("second:cleanup");
      throw new Error("second cleanup failed");
    };
  });

  render(
    html`${[
      html`<i ref=${first}>one</i>`,
      html`<b ref=${second}>two</b>`,
    ]}`,
    root,
  );

  let thrown;
  try {
    unmount(root);
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof AggregateError);
  assert.deepEqual(
    collectErrorMessages(thrown).sort(),
    ["first cleanup failed", "second cleanup failed"].sort(),
  );
  assert.deepEqual(calls, [
    "first:cleanup",
    "first:detach",
    "second:cleanup",
    "second:detach",
  ]);
  assert.equal(root.childNodes.length, 0);
  root.remove();
});

test("a keyed cleanup error rolls back without poisoning later renders", async () => {
  const { each } = await import("../../dist/src/each.js");
  const root = connectedRoot();
  let failCleanup = true;
  const itemRefs = new Map();
  const itemRef = (id) => {
    let directive = itemRefs.get(id);
    if (!directive) {
      directive = ref((element) => {
        if (!element || id !== 1) return;
        return () => {
          if (!failCleanup) return;
          failCleanup = false;
          throw new Error("item cleanup failed");
        };
      });
      itemRefs.set(id, directive);
    }
    return directive;
  };
  const view = (ids) => html`
    <ul>
      ${each(
        ids,
        (id) => id,
        (id) => html`<li ref=${itemRef(id)}>${id}</li>`,
      )}
    </ul>
  `;

  render(view([1, 2]), root);
  assert.throws(() => render(view([2]), root), /item cleanup failed/);
  assert.deepEqual(
    [...root.querySelectorAll("li")].map((item) => item.textContent),
    ["1", "2"],
    "the failed removal restores the last successful keyed tree",
  );

  render(view([2]), root);
  assert.deepEqual(
    [...root.querySelectorAll("li")].map((item) => item.textContent),
    ["2"],
  );
  removeRoot(root);
});

test("top-level dynamic children remain mounted across same-template renders", () => {
  const root = connectedRoot();
  const childRefCalls = [];
  const childRef = ref((element) => {
    childRefCalls.push(element ? "attach" : "detach");
  });
  const nested = (label) => html`<button ref=${childRef}>${label}</button>`;
  const view = (label) => html`${nested(label)}`;

  render(view("one"), root);
  const button = root.querySelector("button");
  render(view("two"), root);

  assert.equal(root.querySelector("button"), button);
  assert.equal(button.textContent, "two");
  assert.deepEqual(childRefCalls, ["attach"]);
  removeRoot(root);
  assert.deepEqual(childRefCalls, ["attach", "detach"]);
});

test("render detects an externally removed top-level dynamic owned node", () => {
  const root = connectedRoot();
  const nested = (label) => html`<button>${label}</button>`;
  const view = (label) => html`${nested(label)}`;

  render(view("one"), root);
  const removed = root.querySelector("button");
  removed.remove();

  render(view("two"), root);
  const replacement = root.querySelector("button");
  assert.ok(replacement);
  assert.notEqual(replacement, removed);
  assert.equal(replacement.textContent, "two");
  removeRoot(root);
});

test("a failed first explicit commit is terminal and disposes the instance", () => {
  const calls = [];
  const instance = instantiate(
    html`<button
      ref=${ref((element) => {
        calls.push(element ? "attach" : "detach");
        if (element) throw new Error("terminal commit");
      })}
    ></button>`,
  );
  document.body.append(instance.fragment);

  assert.throws(() => instance.commit(), /terminal commit/);
  assert.deepEqual(calls, ["attach", "detach"]);
  assert.equal(instance.nodes.some((node) => node.isConnected), false);
  assert.throws(
    () => instance.update(html`<button></button>`),
    /cannot update a disposed template instance/,
  );
  assert.doesNotThrow(() => instance.commit());
});

test("same-template owner adoption is transactional across failed updates", () => {
  const root = connectedRoot();
  const cleanups = { current: 0, failed: 0, next: 0 };
  const stableRef = () => undefined;
  const view = (label, callback) => html`
    <button data-label=${label} ref=${ref(callback)}>${label}</button>
  `;

  const current = view("current", stableRef);
  _setTemplateOwner(current, () => cleanups.current++);
  render(current, root);

  const failed = view("failed", (element) => {
    if (element) throw new Error("candidate ref failed");
  });
  _setTemplateOwner(failed, () => cleanups.failed++);

  assert.throws(() => render(failed, root), /candidate ref failed/);
  assert.deepEqual(cleanups, { current: 0, failed: 1, next: 0 });
  assert.equal(root.querySelector("button")?.dataset.label, "current");
  assert.equal(root.textContent.trim(), "current");

  const next = view("next", stableRef);
  _setTemplateOwner(next, () => cleanups.next++);
  render(next, root);
  assert.deepEqual(
    cleanups,
    { current: 1, failed: 1, next: 0 },
    "a later successful reuse releases the prior owner exactly once",
  );
  assert.equal(root.querySelector("button")?.dataset.label, "next");

  removeRoot(root);
  assert.deepEqual(cleanups, { current: 1, failed: 1, next: 1 });
});
