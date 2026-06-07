# Project layout

Каждый new-проект на Mado имеет одинаковую структуру. Это **обязательное** соглашение.

```
my-app/
├── package.json              # ровно 1 dep: typescript (esbuild опц.)
├── tsconfig.json             # с paths "@madojs/mado" → импорт без относительных путей
├── Dockerfile + nginx.conf   # копируем из Mado/ при scaffold
├── .gitlab-ci.yml | .github/workflows/ci.yml
├── server/serve.mjs          # dev-сервер из Mado, без deps
├── scripts/
│   ├── bundle.mjs            # esbuild прод-бандл
│   └── new.mjs               # скаффолд страницы
├── templates/                # шаблоны для new.mjs
├── docs/                     # проектные доки (можно копировать наши гайды)
├── public/                   # статика (favicon, манифесты)
└── src/
    ├── main.ts               # точка входа: провайдеры + монтаж <x-app>
    ├── routes.ts             # манифест роутов
    ├── pages/                # одна страница = один файл = `export default page({...})`
    ├── components/           # переиспользуемые компоненты (x-*)
    ├── layouts/              # layout-страницы (для nested)
    └── lib/
        ├── api.ts            # все fetch-обёртки
        ├── contexts.ts       # createContext(...)
        ├── theme.ts          # темы
        └── ...               # утилиты, типы, бизнес-правила
```

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