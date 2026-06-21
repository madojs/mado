# Project Layout

Каждый new-проект на Mado имеет одинаковую структуру. Это **обязательное** соглашение.

```
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # optional; mado() from @madojs/mado/vite
├── index.html                # Vite entry и SPA shell
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
| `public/` | статика, копируется как есть | Vite build | через `out/` |
| `out/` | deploy artifact: SPA shell + assets + baked HTML | `mado release` | yes |

`mado release` = `typecheck` + Vite build (`out/index.html`, `out/assets/`,
`public/*`) + `bake` прямо в route paths + `sitemap.xml` + precompression.

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

- ❌ Лишние конфиги билдеров — для Vite используй `vite.config.ts` с `mado()`.
- ❌ `.env`-файлы — env читается из `process.env`/`import.meta.env` в `lib/config.ts`.
- ❌ Тесты вперемешку с кодом — все в `test/`.
