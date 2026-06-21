# Project layout

Every Mado app uses the same shape. This is a **mandatory** convention — it
exists so that you, your teammates, and any LLM assistant always know where
things live.

```
my-app/
├── package.json              # exactly one runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # optional; use mado() from @madojs/mado/vite
├── index.html                # Vite entry + SPA shell
├── public/                   # static assets (favicons, images, robots.txt)
└── src/
    ├── main.ts               # entry: mount router into #app
    ├── app.routes.ts         # one app map (default + named `manifest`)
    ├── layouts/              # app-zone layouts, not domain modules
    ├── shared/               # ui, http, lib, styles
    └── modules/              # bounded contexts
        └── billing/
            ├── billing.routes.ts
            ├── billing.public.ts
            ├── billing.types.ts
            ├── pages/
            ├── data/
            ├── api/
            └── _contracts/
```

## The three artifact states (read this once, never wonder again)

| Folder      | What it is                                                     | Who writes        | Who reads                  | Deploy?           |
|-------------|----------------------------------------------------------------|-------------------|----------------------------|-------------------|
| `src/`      | your source (TypeScript)                                       | you               | Vite, `tsc --noEmit`       | ❌ no             |
| `public/`   | static assets copied as-is (favicon, images, robots.txt)       | you               | Vite build                 | ✅ via `out/`     |
| `out/`      | **the deploy artifact**: SPA shell + assets + baked HTML       | `mado release`    | nginx / CDN / Cloudflare   | ✅ **yes**        |

One-liner to remember:
> Develop with `mado dev`. To ship: run `mado release`, then upload `out/`.

`mado release` = `typecheck` + Vite build (`out/index.html`, `out/assets/`,
`public/*`) + `bake` directly into deployable route paths + `sitemap.xml` +
precompressed assets and CDN helper files.

`index.html` belongs at the project root because Vite treats it as an entry
template, not as a static public file. Put only copy-as-is files in `public/`.

### Quick deployment matrix

| Target                | Command                              | Where it goes              |
|-----------------------|--------------------------------------|----------------------------|
| VPS + nginx           | `mado release && rsync -avz out/ …`  | `/var/www/<app>/`          |
| Cloudflare Pages      | `mado release && wrangler pages deploy out` | CF Pages                 |
| Netlify / S3 / GH Pages | `mado release && upload out/*`     | any static host            |

See `docs/en/13-deployment.md` for full recipes.

## Where to put a new file?

| What                                | Where                                                |
|-------------------------------------|------------------------------------------------------|
| Page for a new URL                  | `src/modules/<module>/pages/<name>.page.ts` + module routes |
| Module route map                    | `src/modules/<module>/<module>.routes.ts`            |
| App shell/layout                    | `src/layouts/<zone>.layout.ts`                       |
| Reusable shared UI widget           | `src/shared/ui/<x-name>.component.ts`                |
| Module-only UI widget               | `src/modules/<module>/components/<name>.component.ts` |
| API connector                       | `src/modules/<module>/api/<provider>.connector.ts`   |
| Data resource/mutation              | `src/modules/<module>/data/<name>.resource.ts`       |
| Auth/session                        | `src/modules/auth/`                                  |
| Public module surface               | `src/modules/<module>/<module>.public.ts`            |
| Pure function with no UI            | `src/shared/lib/<name>.ts`                           |
| Static image / favicon              | `public/<file>`                                      |
| App-zone shell CSS                  | `src/shared/styles/shell.css`                       |
| Page-level table/form/prose CSS      | `src/shared/styles/content.css`                     |

If you don't know where — that is a signal that **the architecture is
suffering**. Ask the team and **record** the answer in `docs/`. Don't invent a
new top-level folder.

## Naming rules

| What                                | Style                | Example                |
|-------------------------------------|----------------------|------------------------|
| File                                | kebab-case           | `user-profile.ts`      |
| Component tag                       | `x-` + kebab         | `<x-user-profile>`     |
| Context                             | PascalCase + `Ctx`   | `ThemeCtx`, `AuthCtx`  |
| Signal                              | camelCase            | `userId`, `isLoggedIn` |
| Page-internal element               | `x-<route>-page`     | `<x-posts-page>`       |

## Vite config

App/dev/build settings live in `vite.config.ts`.

```ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [mado()],
  css: {
    transformer: "lightningcss",
  },
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

The default starter opts into Vite's Lightning CSS transformer. CSS
minification is already handled by Vite; the explicit transformer keeps
prefixing and modern CSS lowering in Vite instead of in Mado.

`mado bake` uses conventions by default: `src/app.routes.ts` first,
then `src/routes.ts`, `index.html` as the template, and `out/` as output.
Use CLI flags (`--entry`, `--template`, `--out`, `--base-url`) for the few
values that are specific to prerendering.

## What does NOT go in `src/`

- ❌ Extra build tool configs — use `vite.config.ts` with `mado()` when needed.
- ❌ `.env` files — read env in `src/shared/lib/config.ts` from `import.meta.env` /
  `process.env` and import that one module everywhere.
- ❌ Tests mixed with code — put them in `test/`.
- ❌ `examples/` folder — keep large demos outside the app repo.
