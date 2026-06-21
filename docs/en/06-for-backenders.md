# Mado for Backend Developers

> You write in Go / Rust / .NET / Java / Python and you need to build a web UI
> for an admin panel, internal tool or dashboard.  
> This page is the mental model of Mado in 10 minutes, in your language.

---

## The Main Analogy

Mado is structured **like an HTTP server**. Seriously:

| Server world                        | Mado                                           |
| ----------------------------------- | ---------------------------------------------- |
| HTTP router (chi, axum, mux)        | `routes()` — path manifest                     |
| Handler `func(req, resp)`           | `page({ view: (ctx) => html\`...\` })`         |
| Middleware                          | `layout` in `nested()` (wraps the handler)     |
| Template engine (Jinja, Handlebars) | `html\`\`` tagged template                     |
| HTTP client with cache              | `resource()` — fetch + cache + invalidation    |
| Reactive variable / atom            | `signal()` — reactive getter                   |
| Background goroutine / task         | `effect()` — auto-reruns when a signal changes |
| `defer cleanup()`                   | `ctx.onDispose(fn)` in component setup         |
| ENV variables                       | `createContext()` + `provide()`/`inject()`     |

If you understand an HTTP server, you understand Mado.

---

## File Structure — like a regular application

```
src/
├── routes.ts         ← path manifest (like router.go in chi)
├── main.ts           ← entry point (like main.go: setup + run)
├── pages/            ← one file per page (like handler.go)
├── components/       ← reusable UI (like helpers/)
├── layouts/          ← wrappers for groups of pages (like middleware/)
└── lib/              ← business logic, API client (like service/, repo/)
```

One file = one page. No file-based magic routing — everything is declared by hand in `routes.ts`.

---

## Hello World — server analogy

### Go (chi) — for comparison

```go
r := chi.NewRouter()
r.Get("/", func(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("<h1>Hello</h1>"))
})
r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    fmt.Fprintf(w, "<h1>User %s</h1>", id)
})
http.ListenAndServe(":8080", r)
```

### Mado — the same thing

```ts
// src/app.routes.ts
import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user.js"),
});
```

```ts
// src/modules/<module>/pages/home.ts
import { page, html } from "@madojs/mado";
export default page({
  view: () => html`<h1>Hello</h1>`,
});
```

```ts
// src/modules/<module>/pages/user.ts
import { page, html } from "@madojs/mado";
export default page<{ id: string }>({
  view: ({ params }) => html`<h1>User ${params.id}</h1>`,
});
```

Path parameters are available in `params` — just like `chi.URLParam`.

---

## Signals — a reactive variable

If you've written Erlang/Elixir with `Agent`, or Rust with `Arc<Mutex<T>>`, or simply stored state in a struct and updated it — `signal` is the same thing, plus **automatic re-rendering** of the components that read that state.

```ts
import { signal, effect } from "@madojs/mado";

// "variable" with subscription
const count = signal(0);

// read
console.log(count()); // 0

// write
count.set(5);

// "goroutine" that runs on every change
effect(() => {
  console.log("count is now", count());
});
// → will print "count is now 5"

count.set(10);
// → will print "count is now 10"
```

No rules like "can't use inside a condition". A signal is just a getter function. Wherever it is read — that's where the subscription is created.

---

## `resource()` — HTTP client with cache (like `cache.GetOrSet`)

This is the **most useful abstraction for a backend developer**. It's like Redis with automatic invalidation, but in the browser.

```ts
import { resource, mutation, jsonFetcher, invalidate } from "@madojs/mado";

// "user repository"
const userId = signal(1);

const user = resource(
  () => `/api/users/${userId()}`, // cache key (reactive!)
  jsonFetcher<User>(), // how to load
  { staleTime: 60_000 }, // 60-second cache
);

// in the component:
user.data(); // User | undefined
user.error(); // Error | null
user.loading(); // boolean

// mutation (like POST/PUT)
const save = mutation<User, User>(
  (u) =>
    fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then((r) =>
      r.json(),
    ),
  { invalidates: ["/api/users*"] }, // glob invalidation — like `cache.Drop("users:*")`
);

await save.run(newUser);
// automatically: user.data() will update if glob matches
```

Resource keys are cache identities. Include the endpoint, query params and data
shape in the key: two live `resource()` calls with the same key share cached
data and any in-flight request. If two different fetchers use the same in-flight
key, Mado warns because that usually means the cache key is too broad.

If such an abstraction existed in the Go world for server-side caches — we'd all be crying with joy.

---

## Components = handler with its own memory

A component is a **handler** that renders its piece of UI. It has:

- parameters (attributes/properties);
- internal state (`signal`s);
- lifecycle: `connectedCallback` (like Init), `disconnectedCallback` (like Close).

```ts
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);

  return () => html`
    <button @click=${() => count.update((n) => n + 1)}>Clicks: ${count}</button>
  `;
});
```

Usage:

```ts
html`<x-counter></x-counter>`;
```

We register the `<x-counter>` tag in the browser — it becomes a "function" that can be inserted into HTML. This is a **native** browser mechanism (Web Components), Mado only glues it together with signals.

---

## Forms — like `form.Validate()` on the backend

Mado uses **schema-based validation close to native HTML constraints**, plus adds state tracking.

```ts
import { useForm } from "@madojs/mado";

const f = useForm({
  email: { required: true, type: "email" },
  age: { required: true, type: "number", min: 18 },
});

// in the template:
html`
  <form
    @submit=${f.onSubmit(async (v) => {
      await api.save(v);
      f.reset();
    })}
  >
    <input
      name="email"
      .value=${() => f.values().email ?? ""}
      @input=${f.onInput}
      @blur=${f.onBlur}
    />

    ${() =>
      f.errors().email && f.touched().email
        ? html`<small>${f.errors().email}</small>`
        : null}

    <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
  </form>
`;
```

Custom validation — `validate: (values) => errors | null`. No Yup schemas or dependencies.

---

## Context = DI / dependency injection

Just as you pass `context.Context` through the call stack in Go — in Mado context is propagated through the DOM tree.

```ts
import { createContext, provide, inject } from "@madojs/mado";

// declare the "type" of the dependency
const ApiCtx = createContext<ApiClient>(defaultApiClient);

// in the root component — provide
component("x-app", ({ host }) => {
  provide(host, ApiCtx, new ApiClient("https://api.example.com"));
  return () => html`<x-page />`;
});

// in any child — consume
component("x-page", ({ host }) => {
  const api = inject(host, ApiCtx); // signal<ApiClient>
  return () => html`<div>API version: ${() => api().version}</div>`;
});
```

This is like `context.WithValue` / `ctx.Value` in Go, but reactive.

---

## SEO — not SSR, but `bake` (like `templ generate` in Go)

If you're used to server-side rendering for SEO, in Mado this is solved differently: **prerender at build time**.

```ts
// src/modules/<module>/pages/product.ts
export default page({
  bake: {
    paths: () => api.allProductSlugs(), // build-time fetch
    data: ({ slug }) => api.getProduct(slug),
    revalidate: 3600,
  },
  head: ({ slug }, data) => ({
    description: data.description,
    canonical: `/product/${slug}`,
    og: { title: data.name, image: data.image },
  }),
  view: ({ params }) => html`<x-product data-slug=${params.slug} />`,
});
```

```bash
npm run bake   # → out/product/iphone-15/index.html (+ sitemap)
```

The crawler sees ready-made HTML with meta tags. The user sees the same thing + interactivity after JS loads.

More details: [`03-static-bake.md`](./03-static-bake.md).

---

## Typical backend developer tasks — recipes

### CRUD page with a list

```ts
import { page, html, resource, each, signal } from "@madojs/mado";

export default page({
  view: () => {
    const users = resource(() => "/api/users", jsonFetcher<User[]>());

    return html`
      ${() => (users.loading() ? html`<p>Loading…</p>` : null)}
      ${() =>
        users.error() ? html`<p>Error: ${users.error()!.message}</p>` : null}
      <ul>
        ${() =>
          each(
            users.data() ?? [],
            (u) => u.id,
            (u) => html`
              <li><a href="/users/${u.id}" data-link>${u.name}</a></li>
            `,
          )}
      </ul>
    `;
  },
});
```

### Form with POST

```ts
import { useForm, mutation } from "@madojs/mado";

const createUser = mutation<NewUser, User>(
  (u) =>
    fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then((r) =>
      r.json(),
    ),
  { invalidates: ["/api/users*"] },
);

// in page.view:
const f = useForm({ name: { required: true } });

html`
  <form
    @submit=${f.onSubmit(async (v) => {
      await createUser.run(v);
      navigate("/users");
    })}
  >
    <input name="name" @input=${f.onInput} />
    <button>Create</button>
  </form>
`;
```

### Protected zone (auth middleware)

```ts
// src/layouts/auth-layout.ts
import { page, html, effect } from "@madojs/mado";
import { isAuthed, navigate } from "../lib/auth.js";

export default page({
  view: ({ child }) => {
    effect(() => {
      if (!isAuthed()) navigate("/login");
    });
    return html`<div class="app-shell">${child}</div>`;
  },
});
```

```ts
// src/app.routes.ts
import { routes, nested } from "@madojs/mado";

export default routes({
  "/login": () => import("./pages/login.js"),

  "/app/*": nested({
    layout: () => import("./layouts/auth-layout.js"),
    routes: {
      dashboard: () => import("./pages/dashboard.js"),
      users: () => import("./pages/users.js"),
    },
  }),
});
```

### Shared HTTP client (like a small transport package in Go)

```ts
// src/shared/http/http-client.ts
export const httpClient = {
  get: <T>(path: string): Promise<T> =>
    fetch(path).then((r) => r.json() as Promise<T>),
};
```

Module connectors build on this transport and map DTOs to domain types.

---

## What you do **not** need to learn (good news)

- **Hooks and hook rules.** Not in Mado. Signals are ordinary functions.
- **VDOM and reconciliation.** None. Signals update the DOM directly, surgically.
- **Webpack/Vite configs.** No build. `tsc → browser`.
- **`useEffect` dependency arrays.** `effect()` sees what you read on its own.
- **State management libraries** (Redux/Zustand). Signals + context.
- **CSS-in-JS transformations.** Shadow DOM + `css\`\`` + cssVars.
- **Routing v6 → v7 migration guide.** `routes()` is 500 lines, readable in 20 minutes.

---

## What you **will** need to learn (honestly)

These are new concepts. Not scary, but they are additions to your React/Vue base:

1. **Custom Elements / Shadow DOM.** `<x-foo>` is not a div, it is a full-fledged element with its own DOM. Slots, scoped CSS. One evening of MDN reading.
2. **`attribute` vs `property`.** Attribute is a string in HTML (`data-id="5"`), property is a JS property (`el.id = 5`). `?attr=${flag}` and `.prop=${value}` in templates refer to different things. Main rule: **numbers/objects/arrays — via `.prop`, flags — via `?attr`, strings — via `attr`**.
3. **Signals.** If it's your first time — you'll get stuck for 10 minutes, then it's easier than hooks.
4. **`html\`\``-templates.** It's just a JS function with highlighting via [lit-plugin](./04-ide-setup.md). Not magic.

Everything else — standard browser + TypeScript.

---

## What's missing (honestly)

- No hot reload, only full reload via SSE. Sufficient for most cases, but not like Vite.
- No browser extension dev-tools. Use `localStorage.madoDebug = '1'` + console.
- No StackBlitz starters (yet).
- No AI assistant that knows Mado as well as React. When in doubt — read `src/`, it's not scary.

---

## Further reading

- **[`01-routing.md`](./01-routing.md)** — the router in detail.
- **[`02-project-layout.md`](./02-project-layout.md)** — project structure.
- **[`03-static-bake.md`](./03-static-bake.md)** — SEO without SSR.
- **External `madojs-examples` workspace** — full demos (landing + admin).

If something is unclear — open an issue, or just open the source. It really is readable in an evening.
