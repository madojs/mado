# Project Layout

Каждое Mado-приложение использует одну каноничную форму. Это не примерная
рекомендация, а соглашение, чтобы люди и AI-ассистенты одинаково понимали,
куда класть код.

```txt
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # mado() from @madojs/mado/vite
├── index.html                # Vite entry + SPA shell
├── public/                   # статика: favicon, images, robots.txt
└── src/
    ├── main.ts               # импорт CSS и mount router в #app
    ├── app.routes.ts         # app map: manifest + default routes(...)
    ├── layouts/              # layouts app-зон, не доменные модули
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

| Folder | Что это | Кто пишет | Deploy? |
| --- | --- | --- | --- |
| `src/` | исходники TypeScript | ты | no |
| `public/` | статика, копируется как есть | ты | через `out/` |
| `out/` | deploy artifact: SPA shell + assets + baked HTML | `mado release` | yes |

`mado release` = `typecheck` + Vite build (`out/index.html`, `out/assets/`,
`public/*`) + `bake` прямо в route paths + `sitemap.xml` + precompression.

`index.html` лежит в корне, потому что для Vite это entry template. В
`public/` кладите только файлы, которые нужно скопировать как есть.

## Куда положить новый файл?

| Что | Куда |
| --- | --- |
| Страница на новый URL | `src/modules/<module>/pages/<name>.page.ts` + module routes |
| Module route map | `src/modules/<module>/<module>.routes.ts` |
| App shell/layout | `src/layouts/<zone>.layout.ts` |
| Shared UI widget | `src/shared/ui/<x-name>.component.ts` |
| Module-only UI widget | `src/modules/<module>/components/<name>.component.ts` |
| API connector | `src/modules/<module>/api/<provider>.connector.ts` |
| Data resource/mutation | `src/modules/<module>/data/<name>.resource.ts` |
| Auth/session | `src/modules/auth/` |
| Public module surface | `src/modules/<module>/<module>.public.ts` |
| Pure function без UI | `src/shared/lib/<name>.ts` |
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

Starter включает Vite Lightning CSS transformer. Mado не владеет prefixing,
CSS lowering или minification.

## Что НЕ кладём в `src/`

- Лишние build-tool configs — настройка живет в `vite.config.ts`.
- `.env` files — читайте env в `src/shared/lib/config.ts` и импортируйте этот
  модуль.
- Tests рядом с кодом — держите их в `test/`.
