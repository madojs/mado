# Project layout

Every Mado app uses the same shape. This is a **mandatory** convention — it
exists so that you, your teammates, and any LLM assistant always know where
things live.

```
my-app/
├── package.json              # exactly one runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── mado.config.json          # single config file (dev/build/bake/bundle)
├── index.html                # SPA shell (also the template for `mado bake`)
├── public/                   # static assets (favicons, images, robots.txt)
└── src/
    ├── main.ts               # entry: mount router into #app
    ├── routes.ts             # route manifest (default + named `manifest`)
    ├── layouts/              # `page({ child })` layouts for nested routes
    ├── pages/                # one page = one file
    ├── components/           # reusable x-* Web Components
    └── lib/
        ├── api.ts            # API client + error type
        ├── auth.ts           # auth recipe (token + guard)
        └── ...               # contexts, helpers, business rules
```

## The three artifact states (read this once, never wonder again)

| Folder      | What it is                                                     | Who writes        | Who reads                  | Deploy?           |
|-------------|----------------------------------------------------------------|-------------------|----------------------------|-------------------|
| `src/`      | your source (TypeScript)                                       | you               | `tsc`, `esbuild`           | ❌ no             |
| `dist/`     | `tsc` output — native ESM `.js` for the browser                | `mado build`      | `mado dev` (during dev)    | ❌ no (internal)  |
| `public/`   | static assets you authored (favicon, images, robots.txt)       | you               | `mado release` copies it   | ✅ via `out/`     |
| `out/`      | **the deploy artifact**: SPA shell + bundles + baked HTML      | `mado release`    | nginx / CDN / Cloudflare   | ✅ **yes**        |

One-liner to remember:
> Develop with `mado dev`. To ship: run `mado release`, then upload `out/`.

`mado release` = `typecheck` + `build` (tsc → `dist/`) + `bundle` (esbuild
→ `out/assets/`) + `bake` (HTML → `out/baked/`) + copy `public/*` → `out/`.

You almost never need to look inside `dist/`. It exists so the dev browser can
load native ESM modules without a bundler during development. In production
the equivalent code is bundled and hashed into `out/assets/`.

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
| Page for a new URL                  | `src/pages/<name>.ts` + add to `src/routes.ts`       |
| Layout for a group of routes        | `src/layouts/<name>.ts` (referenced from `routes.ts`)|
| Reusable UI widget                  | `src/components/<x-name>.ts`                         |
| API call                            | `src/lib/api.ts` (add a method)                      |
| Auth/session                        | `src/lib/auth.ts`                                    |
| Global context (theme, user, i18n)  | `src/lib/<name>.ts`                                  |
| Pure function with no UI            | `src/lib/util/<name>.ts`                             |
| Static image / favicon              | `public/<file>`                                      |

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

## `mado.config.json` in one screen

```jsonc
{
  "dev": {
    "port": 5173,
    "proxy": { "/api": "http://localhost:3000" }   // dev → backend
  },
  "build": {
    "out": "out",
    "dist": "dist",
    "publicDir": "public"
  },
  "bake": {
    "entry": "src/routes.ts",
    "template": "index.html",
    "baseUrl": "https://example.com"
  },
  "bundle": {
    "splitting": true,
    "compress": ["gz", "br"]
  }
}
```

Precedence: built-in defaults < `mado.config.json` < CLI flags
(< legacy env vars). All keys are optional.

## What does NOT go in `src/`

- ❌ Build tool configs (webpack, rollup, vite) — we don't have any.
- ❌ `.env` files — read env in `src/lib/config.ts` from `import.meta.env` /
  `process.env` and import that one module everywhere.
- ❌ Tests mixed with code — put them in `test/`.
- ❌ `examples/` folder — the framework repository has examples, your app
  does not need one.