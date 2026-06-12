# Project Layout

Каждый new-проект на Mado имеет одинаковую структуру. Это **обязательное** соглашение.

```
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── mado.config.json          # dev/build/bake/bundle config
├── index.html                # SPA shell и template для bake
├── public/                   # статика (favicon, images, robots.txt)
└── src/
    ├── main.ts               # точка входа: mount router в #app
    ├── routes.ts             # route manifest (default + named manifest)
    ├── pages/                # одна страница = один файл = `export default page({...})`
    ├── components/           # переиспользуемые компоненты (x-*)
    ├── layouts/              # layout-страницы (для nested)
    └── lib/
        ├── api.ts            # все fetch-обёртки
        ├── contexts.ts       # createContext(...)
        ├── theme.ts          # темы
        └── ...               # утилиты, типы, бизнес-правила
```

## Artifact States

| Folder | Что это | Кто пишет | Deploy? |
|---|---|---|---|
| `src/` | исходники TypeScript | ты | no |
| `dist/` | output `tsc`, native ESM для dev | `mado build` | no |
| `public/` | авторская статика | ты | через `out/` |
| `out/` | deploy artifact: SPA shell + bundles + promoted baked HTML | `mado release` | yes |

`mado release` = `typecheck` + `build` (`dist/`) + `bundle`
(`out/assets/`) + `bake` (`out/baked/`) + promote baked HTML и
`sitemap.xml` в deployable `out/` paths + copy `public/*`.

## Куда положить новый файл?

| Что | Куда |
|---|---|
| Страница на новый URL | `src/pages/foo.ts` + добавить в `src/routes.ts` |
| Переиспользуемая UI-штука | `src/components/foo-bar.ts` |
| Обёртка над API | `src/lib/api.ts` (добавить метод) |
| Глобальный контекст (тема, юзер, i18n) | `src/lib/<name>.ts` |
| Чистая функция без UI | `src/lib/util/<name>.ts` |

Если не понимаешь куда — это сигнал что **архитектура страдает**. Спроси команду, **зафиксируй** ответ в `docs/`.

## Правила именования

| Что | Стиль | Пример |
|---|---|---|
| Файл | kebab-case | `user-profile.ts` |
| Тэг компонента | `x-` + kebab | `<x-user-profile>` |
| Контекст | PascalCase + `Ctx` | `ThemeCtx`, `AuthCtx` |
| Сигнал | camelCase | `userId`, `isLoggedIn` |
| Page-функция (внутренний компонент) | `x-<route>-page` | `<x-posts-page>` |

## Что НЕ кладём в src/

- ❌ Конфиги билдеров (webpack, rollup, vite) — у нас их нет.
- ❌ `.env`-файлы — env читается из `process.env`/`import.meta.env` в `lib/config.ts`.
- ❌ Тесты вперемешку с кодом — все в `test/`.
