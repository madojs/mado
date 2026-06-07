# Project layout

Every new Mado project has the same structure. This is a **mandatory** convention.

```
my-app/
├── package.json              # exactly 1 dep: typescript (esbuild optional)
├── tsconfig.json             # with paths "@madojs/mado" → import without relative paths
├── Dockerfile + nginx.conf   # copied from Mado/ on scaffold
├── .gitlab-ci.yml | .github/workflows/ci.yml
├── server/serve.mjs          # dev-server from Mado, no deps
├── scripts/
│   ├── bundle.mjs            # esbuild prod bundle
│   └── new.mjs               # page scaffolder
├── templates/                # templates for new.mjs
├── docs/                     # project docs (can copy our guides)
├── public/                   # static assets (favicon, manifests)
└── src/
    ├── main.ts               # entry: providers + mount <x-app>
    ├── routes.ts             # route manifest
    ├── pages/                # one page = one file = `export default page({...})`
    ├── components/           # reusable components (x-*)
    ├── layouts/              # layout pages (for nested)
    └── lib/
        ├── api.ts            # all fetch wrappers
        ├── contexts.ts       # createContext(...)
        ├── theme.ts          # themes
        └── ...               # utilities, types, business rules
```

## Where to put a new file?

| What | Where |
|---|---|
| Page for a new URL | `src/pages/foo.ts` + add to `src/routes.ts` |
| Reusable UI widget | `src/components/foo-bar.ts` |
| API wrapper | `src/lib/api.ts` (add a method) |
| Global context (theme, user, i18n) | `src/lib/<name>.ts` |
| Pure function without UI | `src/lib/util/<name>.ts` |

If you don't know where — that is a signal that **the architecture is suffering**.
Ask the team, **record** the answer in `docs/`.

## Naming rules

| What | Style | Example |
|---|---|---|
| File | kebab-case | `user-profile.ts` |
| Component tag | `x-` + kebab | `<x-user-profile>` |
| Context | PascalCase + `Ctx` | `ThemeCtx`, `AuthCtx` |
| Signal | camelCase | `userId`, `isLoggedIn` |
| Page function (internal component) | `x-<route>-page` | `<x-posts-page>` |

## What does NOT go in src/

- ❌ Build tool configs (webpack, rollup, vite) — we don't have any.
- ❌ `.env` files — env is read from `process.env`/`import.meta.env` in `lib/config.ts`.
- ❌ Tests mixed with code — all in `test/`.
