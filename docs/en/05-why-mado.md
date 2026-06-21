# Why Mado (and why not Lit / Solid / Alpine / htmx)

> If you are choosing a frontend stack for an admin panel, internal tool or
> business SPA, this page is for you.  
> If you already have something working — **don't migrate for the sake of
> migration**, it always costs more than it seems.

Mado is not a "killer" of React/Vue/Svelte. It is a focused tool for teams that
want a complete app stack (routing, forms, data, state, prerender) without
frontend infrastructure overhead. Here is an honest comparison of **when Mado is
genuinely better than the alternatives**, and when it is not.

---

## TL;DR — one table

| If you care about…                                                                                             | Choose                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Best learning infrastructure / huge ecosystem                                                                  | **React** or **Vue**      |
| Component design system for embedding into any framework                                                       | **Lit**                   |
| Top performance on large lists, "close to vanilla" with JSX                                                    | **Solid** or **Svelte 5** |
| Progressive enhancement of classic server-rendered apps                                                        | **htmx** + your backend   |
| "Sprinkling" reactivity onto a static site                                                                     | **Alpine.js**             |
| Minimal tooling, maximum platform, everything in one box (router + data + forms + SEO), readable in an evening | **Mado** ✓                |

If your case does not fall into the last point — Mado is most likely not the best choice. That's fine.

---

## Mado vs Lit

**Lit** is the closest alternative in spirit. Same approach: Web Components + tagged templates + minimal magic.

|                | Lit                                                            | Mado                                                   |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Size           | ~6 KB                                                          | ~16 KB                                                 |
| Age / support  | ~10 years, Google                                              | 6 months, single author                                |
| Reactivity     | `@property` decorators + manual `requestUpdate`                | signals (`signal`/`computed`/`effect`) out of the box  |
| Router         | none, you need to find one (`@lit-labs/router`, etc)           | included: `routes()` + layout groups + prefetch        |
| Data fetching  | none, you need to assemble it                                  | `resource()` + `mutation()` + glob invalidation        |
| Forms          | none                                                           | `useForm()` with HTML-like constraints                 |
| SEO / static   | complex (`@lit-labs/ssr`)                                      | `bake` (linkedom) + edge-prerender                     |
| Build          | needs framework-specific build plugins                         | Vite transport + native runtime                         |
| Code style     | classes + decorators                                           | functions + tagged templates                           |
| Ecosystem      | real (Shoelace, Material Web, etc.)                            | none                                                   |
| When to choose | writing a design system / Web Components library for embedding | writing a full application, want everything in one box |

**Honest pitch:** _"Lit is better if you're writing a component design system. Mado is better if you're writing an application and want batteries included without assembling 8 packages."_

---

## Mado vs Solid

**Solid** is a top-tier reactive library built on signals. Technically very impressive.

|                 | Solid                                                       | Mado                                                 |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Size            | ~7 KB                                                       | ~16 KB                                               |
| Performance     | top-3 on js-framework-benchmark                             | good, but not top                                    |
| Reactivity      | signals (same class of ideas)                               | signals                                              |
| Templates       | JSX (compiled to reactive expressions)                      | tagged template `html\`\``                           |
| Component model | functions, Solid virtual nodes                              | Web Components                                       |
| Build           | Vite + babel-plugin-solid required                          | Vite for dev/build, no runtime dependencies          |
| Router          | `@solidjs/router`                                           | included                                             |
| Data            | `createResource`                                            | `resource()`                                         |
| SSR             | seriously supported (SolidStart)                            | intentionally none                                   |
| Ecosystem       | growing, ~50 packages                                       | none                                                 |
| When to choose  | need top performance + JSX + willing to configure the build | want browser-native runtime with simple tooling      |

**Honest pitch:** _"Solid is technically faster and more mature. Mado is smaller in concept: browser-native runtime, Web Components, tagged templates, and Vite doing the boring dev/build work. If you want JSX and a larger ecosystem, go with Solid."_

---

## Mado vs Svelte 5

**Svelte 5** with runes — also a signal model, also minimalist.

|                 | Svelte 5                           | Mado                                   |
| --------------- | ---------------------------------- | -------------------------------------- |
| Runtime size    | ~3 KB                              | ~16 KB                                 |
| Compiler        | required (.svelte → JS)            | none                                   |
| Syntax          | custom .svelte format              | TS + tagged templates                  |
| Reactivity      | `$state`/`$derived` (runes)        | `signal`/`computed`                    |
| SSR / SvelteKit | full-featured, mature              | intentionally none                     |
| Ecosystem       | large, excellent dev-tools         | none                                   |
| When to choose  | new production project with a team | private/internal tool, need simplicity |

**Honest pitch:** _"Svelte is a product choice. Mado is an engineering one. If you have a team and a production app — Svelte. If you're alone and want control — Mado."_

---

## Mado vs htmx

**htmx** is a different school: HTML-fragments over the wire.

|                    | htmx                                                                     | Mado                                                |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Architecture       | HTML from server, updated via fragments                                  | SPA: JS loads data, renders itself                  |
| Backend dependency | strong (backend must be able to serve HTML)                              | weak (backend is a JSON API)                        |
| Client state       | minimal (cookies, localStorage)                                          | full (signal, persisted)                            |
| Optimistic updates | difficult                                                                | easy (mutation + invalidates)                       |
| Offline / PWA      | poor                                                                     | decent                                              |
| Size               | ~14 KB                                                                   | ~16 KB                                              |
| When to choose     | classic server-rendered app (Rails, Django, Phoenix), need to "liven up" | SPA experience is required, backend is REST/GraphQL |

**Honest pitch:** _"htmx — if the backend is solid and can serve HTML. Mado — if the backend serves JSON and you need a full SPA experience."_

---

## Mado vs Alpine.js

**Alpine** — reactive attributes directly in HTML.

|                  | Alpine                                                  | Mado                                     |
| ---------------- | ------------------------------------------------------- | ---------------------------------------- |
| Purpose          | enhancing static HTML                                   | full SPA                                 |
| Size             | ~7 KB                                                   | ~16 KB                                   |
| State management | `x-data` locally                                        | signals + context + persisted            |
| Routing          | none                                                    | included                                 |
| TypeScript       | poor                                                    | first-class                              |
| When to choose   | static sites, landing pages, need 5 interactive buttons | full app: pages, navigation, forms, data |

**Honest pitch:** _"Alpine — for interactivity on static sites. Mado — for a full application."_

---

## Mado vs React + ecosystem

I won't dwell on this for long, because React is in a **different weight class** in terms of ecosystem and maturity. But if you're seriously comparing:

**React wins:**

- massive ecosystem: thousands of UI kits, thousands of articles, endless tutorials;
- AI assistants (ChatGPT, Copilot) know React better than anything;
- better job market;
- better SSR support (Next.js).

**Mado wins:**

- bundle size dozens of times smaller;
- zero infrastructure (no Vite, no Babel, no 200 packages);
- readable in an evening — if something breaks, open `src/`;
- signals instead of hooks (no "can't use in an if" rules, no stale-closure traps);
- no need to migrate between major versions.

**When to choose Mado over React:**

- 1–3 person project, for years to come;
- bundle size is critical;
- you're tired of React fatigue and are ready to sacrifice the ecosystem for simplicity.

**When to choose React:**

- team of 5 or more people;
- you need UI kits, you need the ecosystem;
- a project that will be hiring new people from the market;
- you need SSR with hydration (Next.js).

---

## Mado's strongest argument

Not size, not performance, not signals — everything has better competitors.

> **"Open the source and read it in an evening. ~3500 lines, small modules. If something breaks — you don't go to an issue with 3000 comments. You go to `src/router/` and read the code."**

This is called **ownership** — you own the code, rather than depending on someone else's.

For backend developers who are used to small, understandable libraries (chi in Go, axum in Rust, FastAPI in Python), this is a **familiar feeling**. For those to whom this doesn't matter — take whatever is bigger and more mature.

---

## What about performance?

Honestly: **Mado is not the fastest**. The top-3 on js-framework-benchmark are Solid, Inferno, and Svelte. Mado is closer to Lit / Preact in characteristics.

What Mado does for performance out of the box:

- **lazy `computed`** (dirty-flag, not eager);
- **batch microtask scheduler** for `signal.set`;
- **keyed reconciliation** in `each()` with real DOM reuse;
- **sync-rendering** for cached pages in the router;
- **hover-prefetch** for lazy chunks;
- **View Transitions API** for smooth transitions;
- **shared `adoptedStyleSheets`** for CSS;
- **`modulepreload` hints** on the dev server.

This is sufficient for most applications. If you're building Excel in the browser or 60fps WebGL visualization — that's not here (that's Solid or native JS).

---

## Summary

Mado is a **narrow** tool with honest positioning. It is strongest where:

1. You want to **own** the code and read it in its entirety.
2. **Infrastructure simplicity** is critical (no Vite/Webpack/Babel).
3. You need **batteries in one box** (router + data + forms + SEO).
4. You are not a junior and are not afraid of Web Components.

If even one point doesn't apply to you — take an alternative from the table above. Don't put up with a tool that doesn't fit.

— The author of Mado, a former React developer who moved to the backend and now glues together frontends in his spare time.
