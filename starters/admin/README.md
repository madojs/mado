# __APP_NAME__

A starter Mado admin app: nested routes, a guarded admin shell, a blessed API
client, and a one-shot release pipeline.

## What you get

- `src/main.ts` — 8 lines: mount the router into `#app`. Layouts are NOT
  declared here, only in `src/routes.ts`.
- `src/routes.ts` — nested manifest with three groups:
  - `/` → public landing (bakeable),
  - `/login` → centered `auth` layout,
  - `/admin` → `app` layout, **guarded** by `requireAuth`.
- `src/layouts/app.ts` — admin shell (top bar + sidebar + content slot).
- `src/layouts/auth.ts` — centered card for sign-in.
- `src/lib/api.ts` — `createApiClient(baseUrl)` with bearer token, 401-refresh
  retry, JSON in/out and a typed `ApiError`.
- `src/lib/auth.ts` — memory-only `accessToken`, `restoreSession()` from an
  HttpOnly refresh cookie, and the `requireAuth` guard.
- `src/components/` — tiny `x-button` and `x-input` Web Components.
- `mado.config.json` — one config file. Includes a `dev.proxy` for `/api`.

## Commands

```bash
npm run dev        # tsc -w + dev server on http://localhost:5173, HMR on
npm run build      # tsc → dist/
npm run typecheck  # tsc --noEmit
npm run bundle     # esbuild → out/assets/
npm run bake       # prerender baked routes → out/baked/
npm run release    # typecheck + build + bundle + bake + copy public/ → out/
npm run preview    # serve out/ locally (production rehearsal)
```

To deploy, run `npm run release` and upload the entire `out/` directory
anywhere static (nginx, Cloudflare Pages, S3, Netlify, GitHub Pages, …).

## Backend expectations

The blessed `api` client speaks JSON. The auth recipe expects:

- `POST /api/auth/login` → `{ accessToken: string }` (sets refresh cookie)
- `POST /api/auth/refresh` → `{ accessToken: string }` (reads refresh cookie)
- `POST /api/auth/logout` → 204 (clears refresh cookie)

Change `mado.config.json#dev.proxy` to point at your backend in development.

## Where things live

| What                | Where                                |
|---------------------|--------------------------------------|
| New URL             | `src/pages/*.ts` + add to `routes.ts`|
| New protected URL   | inside the `/admin` layout block     |
| New layout          | `src/layouts/*.ts`                   |
| New reusable widget | `src/components/x-*.ts`              |
| New API call        | `src/lib/api.ts` (add a method)      |
| New global signal   | `src/lib/<name>.ts`                  |
| Static image        | `public/<file>`                      |

See the framework docs:
[`docs/en/11-layouts.md`](https://github.com/madojs/mado/blob/main/docs/en/11-layouts.md),
[`docs/en/12-auth-and-api.md`](https://github.com/madojs/mado/blob/main/docs/en/12-auth-and-api.md),
[`docs/en/13-deployment.md`](https://github.com/madojs/mado/blob/main/docs/en/13-deployment.md).