# Routing

> One manifest file. No folder scanners. No special characters.

## Why not file-based

In Next/SvelteKit/SolidStart routes appear "magically" from file names. This has
advantages (URL structure visible in `pages/`), but in production it means:

- An invisible plugin-scanner in the build. Without it the files are just files.
- Special characters in paths: `[id]`, `(group)`, `_layout`, `+page.svelte`, `...slug`.
- Server-routes and client-routes get confused.
- Testing routing is a pain: you need a build-tool emulator.

Mado considers this **too much magic**. We do it differently.

## Manifest

One file — `src/routes.ts`. One object. Read top to bottom.

```ts
// src/routes.ts
import { routes } from 'madojs';

export default routes({
  '/':              () => import('./pages/home.js'),
  '/about':         () => import('./pages/about.js'),
  '/users/:id':     () => import('./pages/user-profile.js'),
  '/users/:id/edit':() => import('./pages/user-edit.js'),
  '*':              () => import('./pages/not-found.js'),
});
```

Want to see all routes? Open `routes.ts`. No surprises.

## What goes on the right side of a path

Every entry is **one of three things**:

### 1. Lazy import (recommended)

```ts
'/posts': () => import('./pages/posts.js'),
```

- The browser makes its own chunk when bundling (esbuild --bundle --splitting).
- The module is loaded only when the user visits the route.
- Subsequent navigations use the cached result.

### 2. Ready Page (eager)

```ts
import about from './pages/about.js';

'/about': about,
```

In the bundle immediately, no delay. Use for critical pages (home, login).

### 3. Nested with layout

```ts
import { routes, nested } from 'madojs';

export default routes({
  '/': () => import('./pages/home.js'),

  '/admin/*': nested({
    layout: () => import('./layouts/admin.js'),
    routes: {
      '':       () => import('./pages/admin/dashboard.js'),
      'users':  () => import('./pages/admin/users.js'),
      'logs':   () => import('./pages/admin/logs.js'),
    },
  }),
});
```

A layout is just a regular `page({...})` that renders `ctx.child` wherever it wants:

```ts
// src/layouts/admin.ts
import { page, html, css, component } from 'madojs';

export default page({
  view: ({ child }) => html`
    <div class="admin">
      <aside><nav>...</nav></aside>
      <main>${child}</main>
    </div>
  `,
});
```

## Page contract

```ts
import { page, html, resource, jsonFetcher } from 'madojs';

export default page({
  title: ({ id }) => `User #${id}`,        // string | (params) => string
  load:  ({ id }) => resource(...),         // optional, returns Resource or data
  view:  ({ params, data, path, child }) => html`...`,  // REQUIRED
});
```

Three slots, that's all. If you export something other than `page({...})`, a plain
function for instance — `routes()` throws a clear error:

```
[Mado] Lazy route did not return page({...}) as the default export.
```

## URL parameters

```ts
'/users/:id': () => import('./pages/user.js'),
```

```ts
export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view:  ({ params }) => html`<h1>${params.id}</h1>`,
});
```

Types are passed in `page<Params>` — `tsc` verifies that you don't access
`params.foo` which doesn't exist in the route.

## Global options

```ts
export default routes(
  { '/': home, '/about': about, '*': nf },
  {
    titleSuffix: ' · MyApp',                       // → "Home · MyApp"
    loading: () => html`<x-spinner/>`,             // while module loads
    error:   (err) => html`<x-fatal-error .err=${err}/>`,
  },
);
```

## Programmatic navigation

```ts
import route from './routes.js';

route.navigate('/posts');
route.navigate('/posts?page=2');
route.navigate('/posts', { replace: true });
```

Clicks on `<a href="/foo" data-link>` are intercepted globally (without the
attribute — the browser does a full reload, as expected for external links).

## Query parameters

```ts
import { queryParam } from 'madojs';

const page = queryParam('page', '1');
page();              // '1'
page.set('2');       // history.replaceState + re-render
page.set(null);      // delete the parameter
page.set('3', { push: true });   // history.pushState
```

`queryParam` is a normal signal. Use it anywhere: in pages, components, computed.

## What is intentionally absent

- ❌ Auto-scan of `pages/`. **One explicit manifest file**.
- ❌ Special characters in paths (`[id]`, `(group)`, `_layout`). **Parameters are
  `:name` only, nothing else**.
- ❌ Server-side routing in the same manifest. Mado is a client-side framework.
- ❌ Auto-prefetch on hover. If you really need it — do it manually:
  `link.addEventListener('mouseenter', loader)`. Usually unnecessary.

## FAQ

**What if I have 100 routes? Won't the file get huge?**
It will grow to ~150 lines. That is still **one source of truth** versus a hundred
files in `pages/` with magic names. In practice even large projects (1000+ pages)
can split into feature manifests:

```ts
import { routes } from 'madojs';
import adminRoutes from './features/admin/routes.js';
import billingRoutes from './features/billing/routes.js';

export default routes({
  ...adminRoutes,
  ...billingRoutes,
  '*': () => import('./pages/not-found.js'),
});
```

**How do I test routing?**
Import `routes.ts` — it is just an object. Substitute your mock router. No build
tool emulation needed.

**Does code splitting work?**
Yes. With `esbuild --bundle --splitting --format=esm` every
`() => import('./pages/x.js')` becomes its own chunk.
