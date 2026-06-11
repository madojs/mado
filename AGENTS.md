# Agent rules for Mado

> This file is read by AI agents in IDEs (Cursor, Cline, Copilot, Continue, etc.).
> Goal: prevent them from generating React-like code where Mado should be used.
>
> The v0.6 product-surface push is archived in
> [`MADO_V1_PLAN.md`](./MADO_V1_PLAN.md). New work should follow `ROADMAP.md`
> / `TODO.md` unless the user explicitly resumes that tracker.

## Project at a glance

- **Mado** — a calm browser-native SPA framework for internal tools, admin panels and business apps.
- Built on Web Components + signals + tagged-template `html`.
- No build system beyond `tsc`, no runtime dependencies.
- Small TypeScript core in `src/`; bundled/minified full API is roughly 11 KB gzip.

## HARD RULES — violation = bug

### 1. Templates — tagged template `html\`\`` only

```ts
// ❌ NO
const view = <button onClick={fn}>{count}</button>;

// ❌ NO (this is Vue)
const view = `<button @click="fn">{{ count }}</button>`;

// ✅ YES
const view = html`<button @click=${fn}>${count}</button>`;
```

### 2. Reactivity — only via `signal()` / `computed()` / `effect()`

```ts
// ❌ NO (this is React)
const [count, setCount] = useState(0);
useEffect(() => { ... }, [count]);

// ❌ NO (this is Vue/Svelte)
let count = $state(0);
const ref = ref(0);

// ✅ YES
const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));
count.set(5);
count.update(n => n + 1);
```

**A signal is a getter function**: read as `count()`, not `count.value`.

### 3. Components — Web Components via `component()`

```ts
// ❌ NO (classes / decorators / Lit-style)
class MyButton extends HTMLElement { ... }
@customElement('my-button')
class MyButton extends LitElement { ... }

// ❌ NO (React-style functional components)
function Counter() { return <button>...</button>; }

// ✅ YES
component("x-counter", (ctx) => {
  const count = signal(0);
  // setup: return a renderer function
  return () => html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

- The element name **must contain a hyphen** (`x-foo`, `my-btn`, `app-shell`).
- `setup()` is called once on connect. Inside, we create signals and resources.
- We return a renderer function — it is called reactively.

### 4. Cleanup — `ctx.onDispose(fn)`

```ts
// ❌ NO (React)
useEffect(() => {
  const id = setInterval(...);
  return () => clearInterval(id);
}, []);

// ✅ YES
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`...`;
});
```

**`resource()`, `effect()`, and subscriptions inside `setup()` hook into the lifecycle automatically** — no need to write onDispose for them.

### 4b. Reactive attributes — `ctx.attr()`

```ts
// ❌ NO (reading once, never reactive)
component("x-badge", ({ host }) => () => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ❌ NO (MutationObserver boilerplate)
component("x-badge", ({ host, onDispose }) => {
  const variant = signal(host.getAttribute("variant") ?? "default");
  const obs = new MutationObserver(() =>
    variant.set(host.getAttribute("variant") ?? "default"),
  );
  obs.observe(host, { attributes: true, attributeFilter: ["variant"] });
  onDispose(() => obs.disconnect());
  return () => html`<span class=${variant}>...</span>`;
});

// ✅ YES — one line, reactive, no cleanup needed
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return () => html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

`ctx.attr(name, defaultValue?)` returns a `Signal<string>` that auto-updates.
Internally Mado uses `observedAttributes` when available and a per-instance
`MutationObserver` fallback for attributes registered during `setup()`. This is
necessary because the browser reads `observedAttributes` once at
`customElements.define()` time — before any instance calls `setup()`. The
observer auto-disconnects on component removal via lifecycle cleanup.

### 5. Reactive value in template child position = function

The most common AI mistake:

```ts
const count = signal(0);

// ❌ NOT REACTIVE — count() is read once
html`<div>${count() * 2}</div>`;

// ✅ REACTIVE — the function will be called when count changes
html`<div>${() => count() * 2}</div>`;

// ✅ ALSO OK — the signal itself is a function, Mado recognizes it
html`<div>${count}</div>`;
```

**Rule of thumb:** if there is a signal call (with parentheses) inside `${...}`, wrap it in `() => ...`.

### 6. Attribute bindings

```ts
// string/number → attribute
html`<a href=${url}>...</a>`;

// DOM property (objects, numbers without serialization, .value for input)
html`<input .value=${user.name} />`;
html`<my-list .items=${arr}></my-list>`;

// boolean attribute (toggle)
html`<button ?disabled=${isLoading}>...</button>`;

// event
html`<button @click=${fn}>...</button>`;
```

Common mistake: `disabled=${loading()}` — this attempts to set a **string** attribute `disabled="true"` or `disabled="false"`, which does not work correctly. **Use `?disabled=`.**

### 7. Lists — via `each()`

```ts
import { each } from "@madojs/mado";

// ❌ Works, but no keyed reconciliation → loses focus on reorder
html`<ul>
  ${() => items().map((t) => html`<li>${t.name}</li>`)}
</ul>`;

// ✅ Correct: keyed, reuses DOM nodes
html`<ul>
  ${() =>
    each(
      items(),
      (t) => t.id,
      (t) => html`<li>${t.name}</li>`,
    )}
</ul>`;
```

### 8. Routing — `routes()` + `page()`

```ts
// routes.ts — manifest
import { routes } from "@madojs/mado";
export default routes({
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user.js"),
  "*": () => import("./pages/not-found.js"),
});

// page file
import { page, html } from "@madojs/mado";
export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view: ({ params }) => html`<x-user data-id=${params.id}></x-user>`,
});
```

- Each page is a **separate file** in `pages/` with `export default page({...})`.
- Import via `() => import("./pages/foo.js")` — this enables code-splitting via ESM.
- Programmatic navigation: `import { navigate } from "@madojs/mado"; navigate("/users/42")`.
- **`onDispose`** — cleanup hook for page views. Use for `setInterval`, `WebSocket`, `EventSource`. `resource()` and `effect()` are auto-cleaned.
- **`untracked()`** — required when reading signals inside async functions called synchronously from `view()`. Without it, the signal subscribes the router's render effect → infinite loop.

```ts
// page with polling and cleanup
import { page, html, signal, untracked } from "@madojs/mado";
export default page({
  view: ({ onDispose }) => {
    const data = signal(null);
    const poll = async () => {
      // untracked: don't subscribe the router's render effect
      const res = await fetch("/api/status");
      data.set(await res.json());
    };
    const id = setInterval(poll, 5000);
    onDispose(() => clearInterval(id)); // ← cleaned up on navigation
    poll(); // initial call
    return html`<div>${() => JSON.stringify(data())}</div>`;
  },
});
```

### 9. Data fetching — `resource()` / `mutation()`

```ts
// ❌ NO (React Query / SWR)
const { data } = useQuery(['user', id], () => fetch(...));

// ✅ YES
import { resource, jsonFetcher, mutation, invalidate } from "@madojs/mado";

const user = resource(
  () => `/api/users/${userId()}`,   // key (reactive — will recreate on change)
  jsonFetcher<User>(),               // how to load
  { staleTime: 60_000 },
);
// user.data() / user.error() / user.loading() / user.refresh() / user.mutate()

const save = mutation<User, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },  // glob invalidation
);
await save.run(newUser);
```

### 10. Forms — `useForm()`

```ts
// ❌ NO (Formik / RHF / Yup)
const { register, handleSubmit } = useForm({ resolver: yupResolver(schema) });

// ✅ YES
import { useForm } from "@madojs/mado";

const f = useForm({
  email: { required: true, type: "email" },
  age: { required: true, type: "number", min: 18 },
});

html`
  <form
    @submit=${f.onSubmit(async (v) => {
      await api.save(v);
    })}
  >
    <input name="email" @input=${f.onInput} @blur=${f.onBlur} />
    ${() =>
      f.touched().email && f.errors().email
        ? html`<small>${f.errors().email}</small>`
        : null}
    <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
  </form>
`;
```

Custom validation — `validate: (values) => ({ field: 'error message' } | null)`.

### 11. Styles — `css\`\`` + Shadow DOM by default

```ts
import { component, css, html } from "@madojs/mado";

component("x-card", () => () => html`<div><slot></slot></div>`, {
  styles: css`
    :host {
      display: block;
      padding: 1rem;
    }
    div {
      background: var(--bg);
    }
    ::slotted(h2) {
      margin: 0;
    }
  `,
});

// Light DOM (without Shadow), global styles:
component("x-shell", () => () => html`...`, {
  shadow: false, // disables Shadow DOM
  styles: css`x-shell header { ... }`, // selectors are written as usual
});
```

### 12. Context (DI) — `createContext` / `provide` / `inject`

```ts
import { createContext, provide, inject } from "@madojs/mado";

const ApiCtx = createContext<ApiClient>(defaultApi);

component("x-app", ({ host }) => {
  provide(host, ApiCtx, new ApiClient(...));
  return () => html`<x-child></x-child>`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx);  // signal<ApiClient>
  return () => html`<div>${() => api().version}</div>`;
});
```

### 13. Component registration imports

Custom elements are global after registration, but the browser never imports a
component file automatically.

```ts
import "./components/app-shell.js";

render(html`<x-app-shell>${router.view}</x-app-shell>`, app);
```

The import runs `customElements.define("x-app-shell", ...)`. After that,
`<x-app-shell>` works anywhere in the current document.

Rules:

- App shell / global providers → import in `main.ts`.
- Components used only by one page → import in that page.
- Components shared by a feature → import in the feature entry/page.
- Tiny leaf components used everywhere → importing in `main.ts` is acceptable.
- Do **not** bulk-import every component "just in case".

## SOFT GUIDELINES — recommended, but not critical

- **TypeScript strict.** Use `noUncheckedIndexedAccess`-aware code (with `!` or a type guard).
- **Import using `.js`** (not `.ts`) — this is required by ES modules in the browser: `import { foo } from "./bar.js"`.
- **One file = one responsibility.** Don't put 5 components in one file "because they're all small".
- **Do not add runtime dependencies** (`npm install` in `dependencies`). This violates the framework's principle.
- **JSDoc on public functions** is required. Comments explain "why", not "what".

## Project structure

```
src/
├── routes.ts         ← route manifest, ONE file
├── main.ts           ← entry: mount to #app
├── pages/            ← one page = one file
├── components/       ← reusable x-* components
├── layouts/          ← optional route layout modules (`page({ child })`)
└── lib/              ← API client, contexts, pure logic
```

## App architecture for LLM

When generating an app, prefer the blessed production shape from
`docs/en/10-app-architecture.md` and the `starters/admin/` example:

- `src/main.ts` mounts `routesApi.view` and imports only global styles,
  providers, and tiny shared components.
- `src/routes.ts` exports both `manifest` and `default routes(manifest, ...)`.
- Put route wrappers in `src/layouts/` via `layout()`, not ad-hoc shell logic
  inside every page.
- Put backend access in `src/lib/api.ts` and auth/session logic in
  `src/lib/auth.ts`; guards call auth helpers, pages call API helpers.
- Put one page per file under `src/pages/`; a page imports the feature
  components it renders.
- Use `resource()` for reads, `mutation(..., { invalidates })` for writes,
  and `useForm()` for form state/validation.
- Use `mado release` as the production path. `out/` is the only deploy
  artifact; `dist/` is internal build output.

## Where to find specific answers

| Question                         | File                             |
| -------------------------------- | -------------------------------- |
| How does reactivity work?        | `src/signal.ts` (283 lines)      |
| How are templates parsed?        | `src/html.ts` (1013 lines)       |
| How does the router work?        | `src/router.ts` (~530 lines)     |
| How does resource + cache work?  | `src/resource.ts` (297 lines)    |
| How do forms work?               | `src/forms.ts` (212 lines)       |
| How should an app be structured? | `docs/en/10-app-architecture.md` |
| How should errors be handled?    | `docs/en/15-error-handling.md`   |
| How should bake be used?         | `docs/en/16-bake-cookbook.md`    |
| When something goes wrong        | `docs/en/07-llm-pitfalls.md`     |

## Before committing

```bash
npm run typecheck   # must pass
npm run build       # must build without warnings
npm test            # all tests green
```

## TL;DR for the agent

> If you are about to generate `useState`, JSX, `class extends HTMLElement`, `useEffect` with a return cleanup, `useForm` with yupResolver, `useQuery` with queryClient — **stop, you are not writing Mado**. Read this file again.
