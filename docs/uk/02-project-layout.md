# Структура проєкту

Кожен Mado-застосунок використовує одну канонічну форму. Це потрібно, щоб люди
й AI-асистенти однаково розуміли, де живе код.

```txt
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # mado() from @madojs/mado/vite
├── index.html                # Vite entry + SPA shell
├── public/                   # static assets: favicon, images, robots.txt
└── src/
    ├── main.ts               # imports CSS and mounts router into #app
    ├── app.routes.ts         # app map: manifest + default routes(...)
    ├── layouts/              # app-zone layouts
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

## Artifact States

| Folder | Що це | Хто пише | Deploy? |
| --- | --- | --- | --- |
| `src/` | TypeScript sources | ви | no |
| `public/` | static assets copied as-is | ви | via `out/` |
| `out/` | deploy artifact: SPA shell + assets + baked HTML | `mado release` | yes |

`mado release` = `typecheck` + Vite build (`out/index.html`, `out/assets/`,
`public/*`) + `bake` directly into route paths + `sitemap.xml` + precompression.

## Where To Put Files

| What | Where |
| --- | --- |
| Page for a new URL | `src/modules/<module>/pages/<name>.page.ts` + module routes |
| Module route map | `src/modules/<module>/<module>.routes.ts` |
| App shell/layout | `src/layouts/<zone>.layout.ts` |
| Shared UI widget | `src/shared/ui/<x-name>.component.ts` |
| Module-only UI widget | `src/modules/<module>/components/<name>.component.ts` |
| API connector | `src/modules/<module>/api/<provider>.connector.ts` |
| Data resource/mutation | `src/modules/<module>/data/<name>.resource.ts` |
| Auth/session | `src/modules/auth/` |
| Public module surface | `src/modules/<module>/<module>.public.ts` |
| Pure function without UI | `src/shared/lib/<name>.ts` |
| Static image / favicon | `public/<file>` |
| App-zone shell CSS | `src/shared/styles/shell.css` |
| Page-level CSS | `src/shared/styles/content.css` |

## Vite Config

```ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [mado()],
  css: {
    transformer: "lightningcss",
  },
});
```

Starter uses Vite's Lightning CSS transformer. Mado does not own prefixing, CSS
lowering or minification.
