# Mado · LLM guide

> Pitfalls that AI assistants (Copilot, Claude, ChatGPT, Cursor) hit when
> generating Mado code, and a practical zero-history test you can hand to a
> fresh model.

This document is for **two audiences**:

1. **AI agents in the IDE** that read `AGENTS.md` / `.cursorrules` /
   `.github/copilot-instructions.md`. The agent entrypoints are intentionally
   short; this file is the long version.
2. **Humans** who received code from an AI with these errors and don't
   understand what's wrong.

If anything below doesn't fit a real Mado codebase, open `mado/src/` and read
the relevant 500 lines. Mado is intentionally small to be readable.

---

## Part 1 — Pitfalls

### Pitfall #1: `${signal()}` instead of `${() => signal()}`

**Symptom:** the value renders once and never updates.

```ts
const count = signal(0);

// ❌ AI often generates this
html`<div>Count: ${count() * 2}</div>`;
// → Renders "Count: 0" once. count() is read when the TemplateResult is built.

// ✅ Correct — getter function
html`<div>Count: ${() => count() * 2}</div>`;
// → Mado wraps this in an effect() and re-renders when count changes.

// ✅ Also correct — the signal itself is a function
html`<div>Count: ${count}</div>`;
```

**Rule:**

- If `${...}` contains an **expression** (anything done with the signal) —
  wrap it in `() => ...`.
- If `${...}` contains **the signal itself** — pass it as-is.

This applies to **child bindings** (text inside tags) and to **attribute
values** (`@click`, `.prop`, `?attr`, regular attributes).

---

### Pitfall #2: `<button disabled=${loading}>` instead of `?disabled`

**Symptom:** the button is not disabled, or is always disabled.

```ts
const loading = signal(false);

// ❌ setAttribute("disabled", "false") — the DOM treats this as disabled
html`<button disabled=${loading()}>Save</button>`;

// ✅ boolean binding (toggles the attribute)
html`<button ?disabled=${loading}>Save</button>`;
```

| Prefix    | What it does                          | When to use                              |
| --------- | ------------------------------------- | ---------------------------------------- |
| `attr=`   | `setAttribute("attr", value)`         | strings, numbers, URLs                   |
| `.attr=`  | `el.attr = value` (DOM property)      | objects, arrays, `input.value`           |
| `?attr=`  | toggle attribute (by truthiness)      | `disabled`, `hidden`, `checked`, etc.    |
| `@evt=`   | `addEventListener("evt", fn)`         | event handlers                           |

---

### Pitfall #3: useState / useEffect style

**Symptom:** AI generates React-shaped code that doesn't work in Mado.

```ts
// ❌ AI often writes this
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => { console.log(count); }, [count]);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// ✅ Correct in Mado
import { component, signal, effect, html } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  effect(() => console.log(count()));  // auto-subscribes, auto-disposed
  return () => html`
    <button @click=${() => count.update(c => c + 1)}>${count}</button>
  `;
});
```

Key differences:

- No hooks, no hook rules.
- `signal()` can be created anywhere — setup, effect, handler.
- `effect()` discovers its dependencies on its own; no dependency array.
- A component is `component("x-name", setup)`, not a JSX function.

---

### Pitfall #4: `useEffect(() => { ... return cleanup })` for unmount

**Symptom:** AI returns `cleanup` from an `effect()` expecting React-style
unmount cleanup.

```ts
// ❌ This is per-run cleanup, NOT unmount cleanup
component("x-timer", () => {
  effect(() => {
    const id = setInterval(..., 1000);
    return () => clearInterval(id);  // runs before next effect re-run
  });
  return () => html`...`;
});

// ✅ Use ctx.onDispose for unmount
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`...`;
});
```

`effect()` does support `return cleanup`, but it runs before the next
execution of the same effect, not on disconnect. For unmount use
`ctx.onDispose`.

---

### Pitfall #5: Component as a class or with a decorator

**Symptom:** AI emits Lit-style or vanilla `HTMLElement` subclasses.

```ts
// ❌ "let's do it like Lit"
@customElement('x-counter')
class XCounter extends LitElement { ... }

// ❌ "let's do it vanilla"
class XCounter extends HTMLElement {
  connectedCallback() { ... }
}
customElements.define("x-counter", XCounter);

// ✅ Functional component()
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  return () => html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

---

### Pitfall #6: imports without the `.js` extension

**Symptom:** TypeScript compiles but the browser 404s.

```ts
// ❌ AI often omits the extension
import { foo } from "./bar";
import { Home } from "./pages/home";

// ✅ ES modules in the browser require the extension
import { foo } from "./bar.js";
import { Home } from "./pages/home.js";
```

TypeScript resolves `./bar.js` back to `./bar.ts` at compile time.

---

### Pitfall #7: lists via `.map()` without keys

**Symptom:** reordering items loses input focus / breaks CSS transitions /
gets slow.

```ts
// ❌ Unkeyed — recreates DOM on every change
html`<ul>${() => items().map((t) => html`<li>${t.name}</li>`)}</ul>`;

// ✅ each() with a key function
import { each } from "@madojs/mado";
html`<ul>
  ${() =>
    each(
      items(),
      (t) => t.id,
      (t) => html`<li>${t.name}</li>`,
    )}
</ul>`;
```

Use `each()` for any dynamic list with stable IDs. Reserve `.map()` for
static lists.

---

### Pitfall #8: `signal.value` or `count.get()`

```ts
const count = signal(0);

// ❌ No such API
count.value;
count.value = 5;
count.get();

// ✅ Correct
count();              // read
count.set(5);         // write
count.update((n) => n + 1);
count.peek();         // read without subscribing
```

---

### Pitfall #9: `provide(Ctx, value)` without host

```ts
// ❌ AI forgets host
provide(ApiCtx, myApi);
inject(ApiCtx);

// ✅ First argument is the host (the current component)
component("x-app", ({ host }) => {
  provide(host, ApiCtx, myApi);
  return () => html`...`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx);   // Signal<value>
  return () => html`...`;
});
```

---

### Pitfall #10: expecting SSR

**Symptom:** AI writes code assuming pages are pre-rendered on a server.

```ts
// ❌ Don't do this — assumes universal/server rendering
if (typeof window !== "undefined") { ... }
```

Mado **does not do SSR with hydration**. Page logic does not run on a
server — there is `mado static`, which renders the page in a real
Chromium at release time and freezes the resulting HTML (including
Shadow DOM via Declarative Shadow DOM). On first paint the live app
performs an **atomic takeover** of the snapshot — not hydration, not
reconciliation, not per-attribute diffing.

This means:

- ✅ `window`, `document`, `location`, `fetch` are always available.
- ❌ Don't gate logic on `typeof window`.
- ❌ Don't use Next.js patterns (`getServerSideProps`, `headers()`).
- ⚠️ `static.paths()` and `static.initialData()` run **in the snapshot
  browser AND in the user bundle**. Keep them browser-safe and
  secret-free.

---

### Pitfall #11: `useForm()` with a zod/yup resolver

```ts
// ❌ No such API
const f = useForm({ resolver: zodResolver(schema) });

// ✅ HTML-style schema validation
const f = useForm({
  email: { required: true, type: "email" },
  age: { required: true, type: "number", min: 18 },
});

// ✅ Or a custom function when HTML5 isn't enough
const f = useForm(
  { name: { required: true } },
  {
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.name && /\d/.test(values.name as string)) {
        errors.name = "Name must not contain digits";
      }
      return Object.keys(errors).length ? errors : null;
    },
  },
);
```

---

### Pitfall #12: Tailwind / styled-components / CSS Modules

**Symptom:** AI suggests typical React CSS solutions.

Mado uses **Shadow DOM + `css\`\`` + CSS variables** by default. Global
class systems (Tailwind, Bootstrap) only reach a component if it opts out
of the shadow root via `{ shadow: false }`:

```ts
// Light-DOM screen — Tailwind classes apply
component(
  "x-admin-page",
  () => () => html`
    <section class="bg-white shadow-lg rounded-lg p-4">...</section>
  `,
  { shadow: false },
);

// Shadow-DOM component (default) — Tailwind does NOT reach inside.
// Style with css`` and customize from outside via ::part() / CSS variables.
component("x-button", () => () => html`<button><slot></slot></button>`, {
  styles: css`
    button {
      background: var(--button-bg, #2563eb);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
    }
  `,
});
```

The full mental model lives in
[10-pages-and-components.md](./10-pages-and-components.md).

---

### Pitfall #13: `import * as Mado from "@madojs/mado"`

Works, but duplicates names and tree-shakes poorly. Prefer named imports:

```ts
// ✅ Canonical
import { signal, html, component, css, page } from "@madojs/mado";

// ⚠️ Works, but heavy
import * as Mado from "@madojs/mado";
Mado.signal(0);
```

---

### Pitfall #14: adding a runtime dependency

Mado is **zero runtime deps** by design. If AI proposes:

- **lodash** → use native JS (`Object.entries`, `structuredClone`, etc.);
- **date-fns** → `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`;
- **uuid** → `crypto.randomUUID()`;
- **axios** → native `fetch` + `jsonFetcher()` from Mado;
- **classnames** → template literal or an object map.

Runtime deps in user projects are fine. Runtime deps in `@madojs/mado`
core are not.

---

### Pitfall #15: inline `<style>` inside page templates

```ts
// ❌ Works, but scales poorly and complicates cleanup
page({
  view: () => html`
    <style>.panel { padding: 1rem; }</style>
    <section class="panel">...</section>
  `,
});

// ✅ Move it into a component with css``
component(
  "x-admin-panel",
  () => () => html`<section class="panel">...</section>`,
  {
    styles: css`.panel { padding: 1rem; }`,
  },
);
```

For admin screens that intentionally use shared layout/form/table CSS,
make the page component `{ shadow: false }`. If the layout uses
`<slot>` to project the page, keep the layout in Shadow DOM and put
its chrome styles in `styles: css\`\``.

---

### Pitfall #16: Shadow DOM links without `data-link`

**Symptom:** clicking a link inside a Web Component causes a full reload,
or hover-prefetch never fires.

```ts
// ❌ Browser will perform a full reload
html`<a href="/tickets/42">Open</a>`;

// ✅ Router intercepts the click, even across Shadow DOM
html`<a href=${routeUrl("/tickets/42")} data-link>Open</a>`;
```

Mado finds the link via `event.composedPath()`, so `data-link` works
inside Shadow DOM. Hover-prefetch uses the same path. Use
`data-no-prefetch` to opt a single link out of prefetch.

`routeUrl()` resolves against `import.meta.env.BASE_URL`, so the same
code works at `/` or under a base path (`/docs/`).

---

### Pitfall #17: `resource()` outside component setup

**Symptom:** AI creates a resource in module scope to "reuse" data
between pages. No lifecycle cleanup, dev warning fires.

```ts
// ❌ No cleanup; will emit a dev warning
const tickets = resource(
  () => "tickets",
  () => api.listTickets(),
);

component("x-tickets", () => {
  return () => html`${() => tickets.data()?.length ?? 0}`;
});

// ✅ Inside the component setup
component("x-tickets", () => {
  const tickets = resource(
    () => "tickets",
    () => api.listTickets(),
  );
  return () => html`${() => tickets.data()?.length ?? 0}`;
});
```

This way invalidation subscriptions, abort controllers and effects are
disposed when the component disconnects.

---

### Pitfall #18: assuming nested templates leak

**Symptom:** AI manually clears `#app` "to be safe" before mounting a
new view.

```ts
const view = signal(html`<x-home></x-home>`);

// ✅ Nested TemplateResult can be returned from a child binding
html`${view}`;
```

Replaced child bindings recursively dispose nested template instances
and effects. This is a regression-tested guarantee since v0.3. If pages
seem to accumulate, that's a core bug, not something you patch in user
code.

---

### Pitfall #19: global CSS utilities inside Shadow DOM

**Symptom:** the page looks unstyled: `.page-head`, `.btn`,
`.form-grid` and friends are not applied.

```ts
// ❌ .page-head is global, but x-dashboard defaults to Shadow DOM
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
);

// ✅ Page/layout/admin-shell components are typically Light DOM
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
  { shadow: false },
);
```

Rule of thumb: **Shadow DOM** for leaf widgets and slot-based layouts;
**Light DOM** for route/page/admin-screen components that intentionally
consume shared layout/form/table CSS. Remember that `<slot>` only
projects children in Shadow DOM. See
[10-pages-and-components.md](./10-pages-and-components.md).

---

### Pitfall #20: `host.getAttribute()` in render = not reactive

```ts
// ❌ Read once per render; external attribute changes don't re-render
component("x-badge", ({ host }) => () => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ✅ ctx.attr() returns a Signal<string> that updates via
//    attributeChangedCallback
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return () => html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

Never read `host.getAttribute()` / `host.hasAttribute()` inside render
for values that may change from outside.

---

### Pitfall #21: Shadow DOM `<button>` not submitting forms

A `<button>` inside Shadow DOM is **not** part of the form owner
algorithm for a `<form>` in Light DOM — this is a spec limitation, not
a Mado bug.

```ts
// ❌ Inner <button type="submit"> can't trigger the parent <form>
component("x-button", () => () => html`<button type="submit"><slot></slot></button>`);

// ✅ Bridge via requestSubmit()
component("x-button", ({ host, attr }) => {
  const disabled = attr("disabled");

  const handleClick = () => {
    const typeAttr = host.getAttribute("type");
    if (typeAttr === "button" || typeAttr === "reset") return;
    const form = host.closest("form");
    if (form && !host.hasAttribute("disabled")) form.requestSubmit();
  };

  return () => html`
    <button ?disabled=${() => disabled() !== ""} @click=${handleClick}>
      <slot></slot>
    </button>
  `;
});
```

See [14-forms.md](./14-forms.md) for the full Shadow-DOM-input recipes.

---

### Pitfall #22: `useForm()` with Shadow DOM custom inputs

When a Shadow DOM input dispatches `input`, the browser retargets
`e.target` from the inner `<input>` to the host `<x-input>`. The host
is an `HTMLElement` and has no `.name` / `.value` — so `useForm`
silently sees `undefined`.

```ts
// ❌ Missing proxy properties
component("x-input", ({ attr }) => {
  const name = attr("name", "");
  return () => html`<input name=${name} />`;
});

// ✅ Proxy name + value back to the host
component("x-input", ({ host, attr }) => {
  const name = attr("name", "");

  Object.defineProperty(host, "name", {
    get: () => host.getAttribute("name") ?? "",
    configurable: true,
  });
  Object.defineProperty(host, "value", {
    get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
    configurable: true,
  });

  return () => html`<input name=${name} />`;
});
```

Again, full pattern in [14-forms.md](./14-forms.md).

---

### Pitfall #23: signal reads in async functions called from `view()`

**Symptom:** `[mado] effect cycle detected: subscriber re-ran more than
100 times in one flush.`

The router calls `page.view()` inside a reactive effect. Any signal
read **synchronously** during `view()` subscribes that render effect.
If the same signal is then written (e.g. `loading.set(true)`), the
router re-runs `view()`, which reads again → infinite loop.

```ts
// ❌ INFINITE LOOP — loadMore reads signals inside the router's effect
export default page({
  view: () => {
    const cursor = signal<string | null>("start");
    const loading = signal(false);

    const loadMore = async () => {
      if (cursor() === null || loading()) return; // ← subscribes render effect!
      loading.set(true);                          // ← re-triggers render → ∞
      // ...
    };

    loadMore(); // called synchronously during view()
    return html`...`;
  },
});

// ✅ Wrap synchronous signal reads in untracked()
import { untracked } from "@madojs/mado";

export default page({
  view: () => {
    const cursor = signal<string | null>("start");
    const loading = signal(false);

    const loadMore = async () => {
      const c = untracked(() => cursor());
      if (c === null || untracked(() => loading())) return;
      loading.set(true);
      // ...
    };

    loadMore();
    return html`...`;
  },
});
```

Rule: any function that reads signals **and** is called synchronously
during `view()` must use `untracked()` for those reads. This includes
data fetching, IntersectionObserver callbacks set up during init, and
timer/polling setup. Signals read inside the **returned template**
(`html\`...\``) are fine — they sit inside a child binding `${() =>
...}` that creates its own effect.

---

### Pitfall #24: `setInterval` / subscriptions in `page()` view without cleanup

**Symptom:** after navigating away, timers/subscriptions keep running
(zombie polling, server logs show requests from pages the user already
left).

```ts
// ❌ Interval survives navigation
export default page({
  view: () => {
    const tick = signal(0);
    setInterval(() => tick.update((n) => n + 1), 3000); // never cleaned up
    return html`<div>${tick}</div>`;
  },
});

// ✅ onDispose for cleanup
export default page({
  view: ({ onDispose }) => {
    const tick = signal(0);
    const id = setInterval(() => tick.update((n) => n + 1), 3000);
    onDispose(() => clearInterval(id));
    return html`<div>${tick}</div>`;
  },
});
```

`resource()` and `effect()` created inside `view()` are cleaned up
automatically on navigation. Only raw browser APIs need explicit
`onDispose`:

- `setInterval` / `setTimeout`
- `addEventListener` on `window` / `document`
- `WebSocket` / `EventSource`
- `IntersectionObserver` / `ResizeObserver`

---

## Part 2 — Cheat-sheet

| If you want to do…                    | Correct in Mado                              |
| ------------------------------------- | -------------------------------------------- |
| `useState(0)`                         | `signal(0)`                                  |
| `useEffect(() => {...}, [a, b])`      | `effect(() => {...})` (auto-deps)            |
| `useEffect(() => return cleanup, [])` | `ctx.onDispose(cleanup)`                     |
| `useMemo(() => x, [a])`               | `computed(() => x)`                          |
| `useCallback(fn, [])`                 | ordinary function                            |
| `useContext(Ctx)`                     | `inject(host, Ctx)`                          |
| `useQuery(['key'], fn)`               | `resource(() => 'key', fn)`                  |
| `useMutation(fn)`                     | `mutation(fn, { invalidates: [...] })`       |
| `useRouter().push('/')`               | `navigate('/')`                              |
| `useRouter().query.q`                 | `queryParam('q')`                            |
| `<input value={v} onChange={...}>`    | `<input .value=${v} @input=${...}>`          |
| `{items.map(x => ...)}`               | `${() => each(items, x => x.id, x => ...)}`  |
| `useForm({ resolver: zodResolver })`  | `useForm({...}, { validate: (v) => ... })`   |
| `class extends HTMLElement`           | `component('x-name', setup)`                 |
| `@customElement('x')`                 | `component('x-name', setup)`                 |
| `host.getAttribute('x')` in render    | `ctx.attr('x', default)` (reactive)          |
| `jsonFetcher()` with auth             | `apiFetcher()` (attaches Bearer token)       |
| `setInterval` in page view            | `onDispose(() => clearInterval(id))`         |
| signal read in `view()` async init    | `untracked(() => cursor())`                  |
| Internal `<a href>` in components     | `<a data-link href=${routeUrl("/x")}>`       |
| SSR / hydration                       | `mado static` (snapshot + atomic takeover)   |

---

## Part 3 — Zero-history evaluation test

A practical validation script: can a **fresh** LLM (no prior Mado context)
write idiomatic Mado without falling back to React-shaped code?

### Allowed context

For the first pass, give the agent only:

- `AGENTS.md`
- `README.md`
- `docs/en/40-llm-guide.md` (this file)
- specific files from the external `madojs-examples` workspace when the
  agent asks for a larger app pattern

The agent may search targeted APIs in `mado/src/` when blocked, but it
should not load the whole framework into context.

### Task

Build a small ticket-admin SPA aimed at a solo / backend developer.

Required behaviour:

- routes: `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, `*`;
- in-memory mock API with realistic async delays;
- list page using `resource()`, `queryParam()` search + status filters,
  `computed()`, and keyed `each()` rows;
- create + edit flows with `useForm()` + `mutation()` + `invalidates`;
- local UI state with `signal()`;
- slotted shell, metric, and badge components for a more realistic admin
  UI;
- a smoke test importing the built example.

### Failure checklist

After implementation, look for any of these and reject:

- JSX, `useState`, `useEffect`, `ref`, `$state`, or class-style
  components;
- `${signal()}` or `${signal() + 1}` where a reactive child thunk is
  required;
- `disabled=${...}` instead of `?disabled=${...}`;
- dynamic lists rendered with unkeyed array mapping instead of `each()`;
- ES-module imports without the `.js` extension;
- `resource()` created outside component setup;
- internal links without `data-link` and `routeUrl()`;
- new runtime dependencies or new public framework APIs;
- assumptions of SSR / hydration / `getServerSideProps`-style hooks.

### What the test is really measuring

The hardest documentation pressure point is **lifecycle**: it should
never look acceptable to create long-lived `resource()` instances at
module scope or in route code that never cleans up. If the agent does
that, the docs need a sharper warning, not a less strict test.
</content>