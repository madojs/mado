# Mado · LLM pitfalls

> Typical mistakes that AI assistants (Copilot, Claude, ChatGPT, Cursor)
> make when generating Mado code. And how to fix them.

This document is for **two audiences**:
1. **AI agents in the IDE** that read `AGENTS.md` / `.cursorrules` / `.github/copilot-instructions.md`. More detail on typical pitfalls is provided here.
2. **Humans** who received code from an AI with these errors and don't understand what's wrong.

---

## Pitfall #1: `${signal()}` instead of `${() => signal()}`

**Symptom:** the value in the template is displayed but does not update when the signal changes.

```ts
const count = signal(0);

// ❌ AI often generates this
html`<div>Count: ${count() * 2}</div>`
// → Will render "Count: 0" and never update again.
// count() is read once when the TemplateResult is created.

// ✅ Correct — getter function
html`<div>Count: ${() => count() * 2}</div>`
// → Mado will create an effect() for this function and re-render when count changes.

// ✅ Also correct — the signal itself is a function
html`<div>Count: ${count}</div>`
```

**Rule:**
- If the `${...}` contains an **expression** (something is done with the signal) — wrap it in `() => ...`.
- If the `${...}` contains **the signal itself** — it can be used as-is.

This applies to **child bindings** (text inside tags) and to **value attributes** (`@click`, `.prop`, `?attr`, regular attributes).

---

## Pitfall #2: `<button disabled=${loading}>` instead of `?disabled`

**Symptom:** the button is not disabled, or is always disabled.

```ts
const loading = signal(false);

// ❌ This is setAttribute("disabled", "false") — the DOM treats this as disabled
html`<button disabled=${loading()}>Save</button>`

// ✅ Correct — boolean binding (toggle attribute)
html`<button ?disabled=${loading}>Save</button>`
```

**Rules for attributes:**
| Prefix | What it does | When to use |
|---|---|---|
| `attr=` | `setAttribute("attr", value)` | strings, numbers, URLs |
| `.attr=` | `el.attr = value` (DOM property) | objects, arrays, input `.value` |
| `?attr=` | toggle attribute (by truthiness) | `disabled`, `hidden`, `checked`, etc |
| `@evt=` | `addEventListener("evt", fn)` | event handlers |

---

## Pitfall #3: useState / useEffect style

**Symptom:** AI generates React-like code that doesn't work in Mado.

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
  effect(() => console.log(count()));  // auto-subscribe, disposed automatically
  return () => html`
    <button @click=${() => count.update(c => c + 1)}>${count}</button>
  `;
});
```

**Key differences:**
- No hooks, no hook rules.
- `signal()` can be created anywhere — in setup, in an effect, in a handler.
- `effect()` sees what it read on its own — no dependency array needed.
- A component is `component("x-name", setup)`, not a JSX function.

---

## Pitfall #4: `useEffect(() => { ... return cleanup })`

**Symptom:** AI writes `return cleanup` inside an effect, expecting it to work like in React.

```ts
// ❌ AI tries to write this
component("x-timer", () => {
  effect(() => {
    const id = setInterval(..., 1000);
    return () => clearInterval(id);  // will NOT work, use ctx.onDispose instead
  });
  return () => html`...`;
});

// ✅ Correct: cleanup via ctx.onDispose
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`...`;
});
```

**Note:** `effect()` does support `return cleanup`, but this is a **per-run cleanup** (runs before the next effect execution), not an unmount cleanup. For unmount cleanup use `ctx.onDispose`.

---

## Pitfall #5: Component as a class or with a decorator

**Symptom:** AI generates a Lit-style or vanilla WebComponent class.

```ts
// ❌ AI: "let's do it like Lit"
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement('x-counter')
class XCounter extends LitElement { ... }

// ❌ AI: "let's do it vanilla style"
class XCounter extends HTMLElement {
  connectedCallback() { ... }
}
customElements.define("x-counter", XCounter);

// ✅ Correct: functional component()
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  return () => html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

---

## Pitfall #6: imports without the `.js` extension

**Symptom:** TypeScript compiles, but the browser gets a 404.

```ts
// ❌ AI often omits the extension
import { foo } from "./bar";
import { Home } from "./pages/home";

// ✅ Correct: ES modules in the browser require the extension
import { foo } from "./bar.js";
import { Home } from "./pages/home.js";
```

**Why `.js` and not `.ts`:** the browser receives already-compiled JS. TypeScript is smart enough to understand `./bar.js` as a reference to `./bar.ts` at compile time.

---

## Pitfall #7: lists via `.map()` without keys

**Symptom:** when reordering elements, input focus is lost / CSS animations break / performance suffers on large lists.

```ts
// ❌ Works, but not keyed: recreates DOM on every change
html`<ul>${() => items().map(t => html`<li>${t.name}</li>`)}</ul>`

// ✅ Correct: each() with a key function
import { each } from "@madojs/mado";
html`<ul>${() => each(items(), t => t.id, t => html`<li>${t.name}</li>`)}</ul>`
```

**Rule:** always use `each()` for lists of arrays with stable IDs. Reserve `.map()` only for static lists.

---

## Pitfall #8: `signal.value` or `count.get()`

**Symptom:** AI writes an API in Vue or pre-v1 Solid style.

```ts
const count = signal(0);

// ❌ No such API
count.value
count.value = 5
count.get()

// ✅ Correct
count()           // read
count.set(5)      // write
count.update(n => n + 1)
count.peek()      // read without subscribing
```

---

## Pitfall #9: `provide(ApiCtx, value)` without host

**Symptom:** TypeError when trying to provide context.

```ts
// ❌ AI forgets host
provide(ApiCtx, myApi);
inject(ApiCtx);

// ✅ Correct: first argument is host (the current component)
component("x-app", ({ host }) => {
  provide(host, ApiCtx, myApi);
  return () => html`...`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx);  // signal<value>
  return () => html`...`;
});
```

---

## Pitfall #10: expecting SSR

**Symptom:** AI writes code assuming the page is pre-rendered on the server.

```ts
// ❌ This works only in the browser
const userId = location.pathname.split("/")[2];

// ❌ This too works only in the browser
if (typeof window !== "undefined") { ... }  // in Mado, window is ALWAYS available
```

Mado **does not do SSR with hydration**. Code does not run on the server — there is only `bake` (static prerender at build time) and edge-prerender. Both replace user code with a linkedom environment, but this is **only** for generating HTML with meta tags, not for executing page logic.

This means:
- ✅ `window`, `document`, `location`, `fetch` — available without checks.
- ❌ Don't write code that tries to "universally work on server and client".
- ❌ Don't use Next.js patterns (`getServerSideProps`, `headers()`).

---

## Pitfall #11: `useForm()` with a zod/yup resolver

**Symptom:** AI wants to plug in a validator.

```ts
// ❌ No such API
const f = useForm({ resolver: zodResolver(schema) });

// ✅ Correct: HTML-like validation through useForm schema
const f = useForm({
  email: { required: true, type: "email" },
  age:   { required: true, type: "number", min: 18 },
});

// ✅ Or a custom function if HTML5 isn't enough
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

## Pitfall #12: Tailwind / styled-components / CSS Modules

**Symptom:** AI suggests standard React CSS solutions.

Mado uses **Shadow DOM + `css\`\`` + CSS variables**. Global UI frameworks (Tailwind, Bootstrap-via-classes) **only work in light DOM** (`shadow: false`):

```ts
// Light-DOM page/screen component, Tailwind classes work
component("x-admin-page", () => () => html`
  <section class="bg-white shadow-lg rounded-lg p-4">
    ...
  </section>
`, { shadow: false });

// Shadow-DOM component (default) — Tailwind does NOT work.
// Use css`` or ::part() for external styling.
component("x-button", () => () => html`<button><slot></slot></button>`, {
  styles: css`
    button {
      background: var(--button-bg, #2563eb);
      color: white;
      padding: .5rem 1rem;
      border-radius: 6px;
    }
  `,
});
```

**Themes and customization — via CSS variables**, not classes.

---

## Pitfall #13: `import * as Mado from "@madojs/mado"`

**Symptom:** AI wants a namespace import.

This works, but duplicates names and tree-shakes poorly. Named imports are preferred:

```ts
// ✅ Canonical
import { signal, html, component, css, page } from "@madojs/mado";

// ⚠️ Works, but excessive
import * as Mado from "@madojs/mado";
Mado.signal(0);
```

---

## Pitfall #14: attempting to add a runtime dependency

**Symptom:** AI suggests `npm install lodash` / `npm install date-fns` / etc.

Mado is **zero runtime deps** by design. If AI wants to add:
- **lodash** → use native JS (`Object.entries`, `Array.prototype`, `structuredClone`);
- **date-fns** → use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`;
- **uuid** → `crypto.randomUUID()`;
- **axios** → native `fetch` + `jsonFetcher()` from Mado;
- **classnames** → native template literal or an object map.

Any runtime dependency is a **violation of the framework's principles**. If you truly cannot avoid it — add it to the user project, not to the Mado core.

---

## Pitfall #15: inline `<style>` inside page templates

**Symptom:** AI puts a large `<style>` directly inside a `html\`\`` page.

```ts
// ❌ Works, but scales poorly and complicates cleanup
page({
  view: () => html`
    <style>.panel { padding: 1rem; }</style>
    <section class="panel">...</section>
  `,
});

// ✅ Correct: component styles via css``
component("x-admin-panel", () => () => html`
  <section class="panel">...</section>
`, {
  styles: css`
    .panel { padding: 1rem; }
  `,
});
```

For backend admin route/page screens it is often appropriate to use `shadow: false`, so that
global layout/form/table utilities work like a regular admin panel. But if
the layout uses `<slot>` to project the page into the shell, keep the layout in
Shadow DOM and keep the shell styles in `styles: css\`\``.

---

## Pitfall #16: Shadow DOM links without `data-link`

**Symptom:** a link inside a Web Component causes a full page reload or is not
prefetched.

```ts
// ❌ Regular link: browser will perform a full reload
html`<a href="/tickets/42">Open</a>`

// ✅ SPA navigation: router() will intercept the click even through Shadow DOM
html`<a href="/tickets/42" data-link>Open</a>`
```

Mado finds the link via `event.composedPath()`, so `data-link` works
inside Shadow DOM as well. Hover-prefetch uses the same path; `data-no-prefetch`
disables prefetch for a specific link.

---

## Pitfall #17: `resource()` outside component setup

**Symptom:** AI creates a resource in module scope to "reuse"
data between pages.

```ts
// ❌ No lifecycle cleanup, will emit dev-warning
const tickets = resource(() => "tickets", () => api.listTickets());

component("x-tickets", () => {
  return () => html`${() => tickets.data()?.length ?? 0}`;
});

// ✅ Create resource inside the component setup
component("x-tickets", () => {
  const tickets = resource(() => "tickets", () => api.listTickets());
  return () => html`${() => tickets.data()?.length ?? 0}`;
});
```

This way invalidation subscriptions, abort controllers, and effects will be
cleaned up when the component disconnects.

---

## Pitfall #18: assuming nested templates don't require cleanup

**Symptom:** AI assembles a route outlet or conditional UI from nested
`TemplateResult`s, and then old elements continue living below the new page.

```ts
const view = signal(html`<x-home></x-home>`);

// ✅ Normal pattern: nested TemplateResult can be returned from a child-binding
html`${view}`
```

Starting from v0.3 this is guaranteed by regression tests: when a child-binding is
replaced, Mado recursively disposes nested template instances/effects. If you see
pages accumulating in `#app`, that is a core bug, not something you need to
clean up manually.

---

## Pitfall #19: global CSS utilities inside Shadow DOM

**Symptom:** the page looks "unstyled": `.page-head`, `.btn`,
`.form-grid`, `.metric-grid` are not applied.

```ts
// ❌ .page-head is declared globally, but x-dashboard defaults to Shadow DOM
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`);

// ✅ Page/layout/admin-shell components often should be Light DOM
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`, { shadow: false });
```

Rule: Shadow DOM — for leaf widgets and slot-based layouts, Light DOM — for
route/page/admin-screen components that intentionally use shared
layout/form/table utilities. Remember: `<slot>` only projects children in
Shadow DOM; with `shadow: false` it is a regular element.
More details: [`09-shadow-vs-light-dom.md`](./09-shadow-vs-light-dom.md).

---

## Cheat-sheet for AI

| If you want to do… | Correct in Mado |
|---|---|
| `useState(0)` | `signal(0)` |
| `useEffect(() => {...}, [a, b])` | `effect(() => {...})` (auto-deps) |
| `useEffect(() => return cleanup, [])` | `ctx.onDispose(cleanup)` |
| `useMemo(() => x, [a])` | `computed(() => x)` |
| `useCallback(fn, [])` | ordinary function |
| `useContext(Ctx)` | `inject(host, Ctx)` |
| `useQuery(['key'], fn)` | `resource(() => 'key', fn)` |
| `useMutation(fn)` | `mutation(fn, { invalidates: [...] })` |
| `useRouter().push('/')` | `navigate('/')` |
| `useRouter().query.q` | `queryParam('q')` |
| `<input value={v} onChange={...}>` | `<input .value=${v} @input=${...}>` |
| `{items.map(x => ...)}` | `${() => each(items, x => x.id, x => ...)}` |
| `useForm({ resolver: zodResolver })` | `useForm({...}, { validate: (v) => ... })` |
| `class extends HTMLElement` | `component('x-name', setup)` |
| `@customElement('x')` | `component('x-name', setup)` |

If something doesn't fit this list — open `src/` and **read 500 lines**. Seriously. Mado is intentionally small to be readable.
