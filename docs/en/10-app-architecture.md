# App architecture

This is the default shape for a production Mado app. It is intentionally boring:
one route manifest, one shell, one API client, one auth module, and page files
that own their feature components.

## File tree

```txt
src/
├── main.ts
├── routes.ts
├── layouts/
│   ├── app.ts
│   └── auth.ts
├── pages/
│   ├── home.ts
│   ├── login.ts
│   ├── not-found.ts
│   └── admin/
│       ├── dashboard.ts
│       ├── orders.ts
│       └── order-detail.ts
├── components/
│   ├── x-button.ts
│   └── x-input.ts
├── lib/
│   ├── api.ts
│   └── auth.ts
└── styles/
    └── global.ts
```

Keep business logic in `lib/`, route wrapping in `layouts/`, and UI leaves in
`components/`. A page should import the components it renders.

## Entry point

```ts
// src/main.ts
import { html, render } from "@madojs/mado";
import "./styles/global.js";
import "./components/x-button.js";
import routesApi from "./routes.js";

render(html`${routesApi.view}`, document.getElementById("app")!);
```

Import global providers and tiny shared components here. Do not bulk-import
every feature component.

## Routes

```ts
// src/routes.ts
import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./lib/auth.js";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/login": layout({
    layout: () => import("./layouts/auth.js"),
    routes: { "/": () => import("./pages/login.js") },
  }),
  "/admin": layout({
    layout: () => import("./layouts/app.js"),
    guard: requireAuth,
    routes: {
      "/": () => import("./pages/admin/dashboard.js"),
      "/orders": () => import("./pages/admin/orders.js"),
      "/orders/:id": () => import("./pages/admin/order-detail.js"),
    },
  }),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, {
  errorPage: (err) => html`<main><h1>Something went wrong</h1><pre>${err.message}</pre></main>`,
});
```

Exporting `manifest` lets `mado bake` inspect the same route table.

## API and auth

Use one API client and one auth module. The admin starter ships a complete
version with token storage, a single-flight refresh request, and a route guard.

```ts
// pages/admin/orders.ts
import { each, html, page, resource } from "@madojs/mado";
import { api } from "../../lib/api.js";

const orders = resource(() => "/api/orders", () => api.get("/orders"));

export default page({
  title: "Orders",
  view: () => html`
    <main>
      <h1>Orders</h1>
      <ul>
        ${() => each(orders.data() ?? [], o => o.id, o => html`<li>${o.number}</li>`)}
      </ul>
    </main>
  `,
});
```

Mutations should declare invalidation near the write:

```ts
const save = mutation((payload) => api.post("/orders", payload), {
  invalidates: ["/api/orders*"],
});
```

## Forms

Prefer one `useForm()` per user workflow.

```ts
const form = useForm({
  email: { required: true, type: "email" },
  "items.*.title": { required: true },
});
const items = form.array("items");
```

Use dotted paths for arrays (`items.0.title`) and keep async validation in
`validateAsync` when it talks to the backend.

## Release

Local development uses `mado dev`. Production uses exactly one artifact:

```bash
mado release
rsync -avz out/ user@server:/var/www/app/
```

`out/` is the deploy folder. `dist/` is internal build output.
