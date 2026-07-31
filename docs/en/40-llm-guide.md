# Mado · LLM guide

> Pitfalls that AI assistants (Copilot, Claude, ChatGPT, Cursor) hit when
> generating Mado code, and a practical zero-history test you can hand to a
> fresh model.

Mado is pre-1.0. Read the current version from the project's `package.json`;
do not infer contracts from an older model snapshot.

This document is for **two audiences**:

1. **AI agents in the IDE** that read `AGENTS.md` / `.cursorrules` /
   `.github/copilot-instructions.md`. The agent entrypoints are intentionally
   short; this file is the long version.
2. **Humans** who received code from an AI with these errors and don't
   understand what's wrong.

If anything below doesn't fit a real Mado codebase, open `mado/src/` and read
the relevant source path together with its focused tests. Do not rely on a
remembered line count or an older model snapshot.

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
// → Mado wraps this slot in an effect() and updates only the slot.

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
  return html`
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

### Pitfall #4: `effect()` around a one-shot non-reactive resource

**Symptom:** AI creates an `effect()` only to imitate React mounting, even
though the resource does not depend on reactive state.

```ts
// ⚠️ Safe, but an unnecessary reactive scope when nothing is reactive
component("x-timer", () => {
  effect(() => {
    const id = setInterval(..., 1000);
    return () => clearInterval(id);
  });
  return html`...`;
});

// ✅ Prefer onDispose for a one-shot raw browser resource
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return html`...`;
});
```

An `effect()` return value is real lifecycle cleanup: Mado runs it before the
effect reruns **and** during final page/component lifecycle disposal. Use that
form when resource acquisition depends on reactive state:

```ts
// Inside component setup or a page view:
effect(() => {
  const socket = new WebSocket(`/stream/${channel()}`);
  return () => socket.close();
});
```

Use `onDispose` for a one-shot, non-reactive timer, listener, observer, socket
or other raw resource. The direct form communicates intent without creating an
unnecessary reactive scope.

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
  return html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

---

### Pitfall #6: applying no-bundler import rules to a Vite app

**Symptom:** AI rejects valid extensionless local imports or deep-imports
framework internals while trying to manufacture a browser-resolvable path.

```ts
// ✅ Generated Mado apps use Vite; extensionless local imports are valid
import { foo } from "./bar";
import HomePage from "./pages/home.page";

// ✅ Use .js only in browser-native examples that run without Vite
import { foo } from "./bar.js";

// ❌ A deep package path ending in dist/src/signal.js is internal

// ✅ Import the public package surface
import { signal } from "@madojs/mado";
```

Vite is Mado's canonical development and build transport. Browser-native,
no-bundler ESM still requires resolvable file extensions, but that rule does
not make `.js` mandatory in generated source. Never import `dist/src/*` or
other Mado internals; use `@madojs/mado` and documented public subpaths.

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
  return html`...`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx);   // Signal<value>
  return html`...`;
});
```

---

### Pitfall #10: expecting SSR

**Symptom:** AI writes code assuming pages are pre-rendered on a server.

```ts
// ❌ Don't do this — assumes universal/server rendering
if (typeof window !== "undefined") { ... }
```

Mado **does not do SSR with hydration**. Page views render in a real browser:
`mado static` opens the built application in Chromium at release time and
freezes the resulting HTML (including Shadow DOM via Declarative Shadow DOM).
On first paint the live app performs an **atomic takeover** of the snapshot —
not hydration, not reconciliation, not per-attribute diffing.

This means:

- ✅ Browser APIs belong directly in page views and component setup; do not
  add SSR-only branches around them.
- ⚠️ Vite imports route/page modules in Node as a discovery control plane.
  Keep module initialization environment-neutral and do not perform browser
  work at module top level.
- ❌ Don't wrap page-view logic in `typeof window` checks copied from an SSR
  framework.
- ❌ Don't use Next.js patterns (`getServerSideProps`, `headers()`).
- ⚠️ `static.paths()` and `static.initialData()` execute during Node
  discovery, while their module and callback code remain in the client
  bundle. Use environment-neutral code and keep it secret-free.

---

### Pitfall #11: `useForm()` with a zod/yup resolver

```ts
// ❌ No such API
const f = useForm({ resolver: zodResolver(schema) });

// ✅ Native constraints in markup, reactive state in Mado
const f = useForm({
  initial: { email: "", age: "" as number | "" },
});
html`<input name="email" type="email" required @input=${f.onInput} />`;

// ✅ Or a custom function when HTML5 isn't enough
const f = useForm({
    initial: { name: "" },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.name && /\d/.test(values.name as string)) {
        errors.name = "Name must not contain digits";
      }
      return Object.keys(errors).length ? errors : null;
    },
});
```

---

### Pitfall #12: Tailwind / styled-components / CSS Modules

**Symptom:** AI suggests typical React CSS solutions.

Screens and layouts are `page()` definitions in the light DOM, so a global
stylesheet imported by `main.ts` reaches them. Autonomous Web Components use
Shadow DOM + ``` css`` ``` + CSS variables by default:

```ts
// Light-DOM screen — document-level utility classes apply
export default page({
  view: () => html`
    <section class="bg-white shadow-lg rounded-lg p-4">...</section>
  `,
});

// Shadow-DOM component (default) — Tailwind does NOT reach inside.
// Style with css`` and customize from outside via ::part() / CSS variables.
component("x-button", () => html`<button><slot></slot></button>`, {
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

// ✅ Keep screen markup in the page; put .panel in a global stylesheet
// imported once by src/main.ts.
page({
  view: () => html`<section class="panel">...</section>`,
});
```

If the section is an autonomous reusable widget instead of screen content,
make it a `component()` and colocate its styles in ``` css`` ```. Layouts remain
`page()` wrappers using `{ child }`; do not replace them with slotted custom
elements.

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

### Pitfall #17: standalone `resource()` without an owner

**Symptom:** AI creates a resource in module scope to "reuse" data
between pages, but never disposes its key effect and invalidation listener.

```ts
// ❌ No lifecycle owner and no explicit cleanup
const tickets = resource(
  () => "tickets",
  () => api.listTickets(),
);

component("x-tickets", () => {
  return html`${() => tickets.data()?.length ?? 0}`;
});

// An integration-owned standalone resource is valid only when its owner
// exposes and eventually invokes teardown:
export const disposeTicketsIntegration = () => tickets.dispose();

// ✅ Inside the component setup
component("x-tickets", () => {
  const tickets = resource(
    () => "tickets",
    () => api.listTickets(),
  );
  return html`${() => tickets.data()?.length ?? 0}`;
});
```

This way invalidation subscriptions, abort controllers and effects are
disposed when the component disconnects. A resource intentionally owned by an
application integration may stay standalone, but that integration must call
its idempotent `dispose()`.

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
  () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
);

// ✅ A route screen is a page and therefore already lives in Light DOM
export default page({
  view: () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
});
```

Rule of thumb: **Light DOM** for pages and route layouts that consume shared
layout/form/table CSS; **Shadow DOM** for autonomous widgets with their own
styles. Native markup plus an open-code CSS/bindings recipe is also valid when
no custom-element boundary is useful. Remember that `<slot>` only projects
children in Shadow DOM. See
[10-pages-and-components.md](./10-pages-and-components.md).

---

### Pitfall #20: `host.getAttribute()` in render = not reactive

```ts
// ❌ Read once during setup; external attribute changes do not update it
component("x-badge", ({ host }) => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ✅ ctx.attr() returns a Signal<string> that updates via
//    attributeChangedCallback
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return html`<span class=${() => `badge-${variant()}`}>...</span>`;
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
// ❌ Inner <button type="submit"> cannot submit the parent Light-DOM form
component("x-button", () =>
  html`<button type="submit"><slot></slot></button>`);

// ✅ Keep form semantics native; style the real control
html`<button class="button" type="submit">Save</button>`;
```

Do not recreate native form ownership in a visual button component. Use a
Light-DOM component only when the component genuinely needs to render native
controls into the parent form.

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
  return html`<input name=${name} />`;
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

  return html`<input name=${name} />`;
});
```

Again, full pattern in [14-forms.md](./14-forms.md).

---

### Pitfall #23: expecting a direct signal read to stay reactive

**Symptom:** a value renders once and then never changes.

Page views and component setup are deliberately outside reactive tracking.
They build one template for the active lifecycle. Reactivity belongs to the
template slots, not to the function that created the template.

```ts
// ❌ Snapshot: count() is evaluated once while the view is created
export default page({
  view: () => {
    const count = signal(0);
    return html`<output>${count()}</output>`;
  },
});

// ✅ Pass the signal itself, or use a getter for an expression
export default page({
  view: () => {
    const count = signal(0);
    return html`
      <button @click=${() => count.update((value) => value + 1)}>
        Count: ${count}
      </button>
      <output>Double: ${() => count() * 2}</output>
    `;
  },
});
```

Initialization code may read signals normally without subscribing the router
or causing a whole-view re-render. `untracked()` remains an advanced tool for
reading a signal inside your own `effect()` without making it a dependency;
it is not required merely because code runs during `view()`.

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

### Pitfall #25: treating Mado UI as runtime or guessing lock ownership

Mado UI is copied source, not a browser package:

```ts
// ❌ There is no Mado UI runtime to ship
import { Badge } from "@madojs/ui";

// ✅ Import the application-owned file copied by the CLI
import "../components/mado-ui-badge.component";
```

Before generating a generic component or changing installed UI, inspect
`mado-ui.json`, `.mado-ui.lock.json` and the
[live catalog](https://ui.madojs.dev). Lock format 2 records
`explicitItems` plus the direct dependencies captured for each installed item.
Those fields are ownership history. Never replace them with guesses from the
current registry graph.

A format-1 lock cannot say which items were requested directly. Ask for or
recover the original roots, then use the explicit migration:

```bash
npx @madojs/ui@latest migrate badge dialog --dry-run
npx @madojs/ui@latest migrate badge dialog
```

Do not delete copied files manually. Remove an explicit root by reviewing the
CLI's deterministic plan first:

```bash
npx @madojs/ui@latest remove dialog --dry-run
npx @madojs/ui@latest remove dialog
```

The command protects locally modified files and dependencies still reachable
from another explicit root.

---

## Part 2 — Cheat-sheet

| If you want to do…                    | Correct in Mado                              |
| ------------------------------------- | -------------------------------------------- |
| `useState(0)`                         | `signal(0)`                                  |
| `useEffect(() => {...}, [a, b])`      | `effect(() => {...})` (auto-deps)            |
| one-shot raw resource in `useEffect`  | acquire directly + `ctx.onDispose(cleanup)`  |
| `useMemo(() => x, [a])`               | `computed(() => x)`                          |
| `useCallback(fn, [])`                 | ordinary function                            |
| `useContext(Ctx)`                     | `inject(host, Ctx)`                          |
| `useQuery(['key'], fn)`               | `resource(() => 'key', fn)`                  |
| `useMutation(fn)`                     | `mutation(fn, { invalidates: [...] })`       |
| `useRouter().push('/')`               | `navigate('/')`                              |
| `useRouter().query.q`                 | `queryParam('q')`                            |
| `<input value={v} onChange={...}>`    | `<input .value=${v} @input=${...}>`          |
| `{items.map(x => ...)}`               | `${() => each(items, x => x.id, x => ...)}`  |
| `useForm({ resolver: zodResolver })`  | `useForm({ initial, validate })` + native constraints |
| authoritative server field errors    | `form.setErrors({ field: message })`          |
| `class extends HTMLElement`           | `component('x-name', setup)`                 |
| `@customElement('x')`                 | `component('x-name', setup)`                 |
| `host.getAttribute('x')` in render    | `ctx.attr('x', default)` (reactive)          |
| `jsonFetcher()` with auth             | `apiFetcher()` (attaches Bearer token)       |
| `setInterval` in page view            | `onDispose(() => clearInterval(id))`         |
| reactive expression in a template    | `${() => expression}`                        |
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
- specific files from `starters/default/src/` when the agent asks for a
  complete small-app pattern
- specific files from `starters/modular/src/` only when the task already
  demonstrates a need for guarded zones or module boundaries

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
- shared route chrome implemented as a `page()` layout with `{ child }`, wired
  through `layout()` in the route manifest and rendered in Light DOM rather
  than through a slotted shell component;
- a domain-specific `ticket-summary` recipe plus an autonomous
  `ticket-status-badge` component that
  exercises scoped Shadow-DOM styles, slots and reactive `ctx.attr()` state;
- a smoke test importing the built example.

This test intentionally evaluates the core application API without assuming
that Mado UI has been initialized. In a real application, inspect
`mado-ui.json`, `.mado-ui.lock.json` and the catalog before recreating a
generic UI item. Never import `@madojs/ui` in browser code or infer explicit
roots for a legacy lock.

### Failure checklist

After implementation, look for any of these and reject:

- JSX, `useState`, `useEffect`, React/JSX `ref={...}`, `Vue.ref()`, `$state`,
  or class-style components (Mado's `ref()` directive is valid);
- `${signal()}` or `${signal() + 1}` where a reactive child thunk is
  required;
- `disabled=${...}` instead of `?disabled=${...}`;
- dynamic lists rendered with unkeyed array mapping instead of `each()`;
- imports from internal Mado package paths instead of its public surfaces;
- `resource()` created outside a page view/component setup without an explicit
  integration owner that calls `dispose()`;
- internal links without `data-link` and `routeUrl()`;
- new runtime dependencies or new public framework APIs;
- assumptions of SSR / hydration / `getServerSideProps`-style hooks.

### What the test is really measuring

The hardest documentation pressure point is **lifecycle**: it should
never look acceptable to create long-lived `resource()` instances at
module scope or in route code that never cleans up. If the agent does
that, the docs need a sharper warning, not a less strict test.
