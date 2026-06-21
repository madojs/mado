# Карта заморозки API

> Что публично, что внутреннее, и что SemVer будет защищать в v1.

Контракт Mado v1 намеренно небольшой. Код приложения импортирует API из корня
пакета:

```ts
import { component, html, resource, routes, signal } from "@madojs/mado";
```

Публичные subpaths — side-effect модуль devtools и Vite integration:

```ts
import "@madojs/mado/devtools.js";
import { mado } from "@madojs/mado/vite";
```

Все остальное под `dist/src/` — деталь реализации, даже если файл виден в
репозитории.

## Стабильный публичный API

Эти имена публичны и будут защищены SemVer после v1:

- Reactivity: `signal`, `computed`, `effect`, `untracked`, `batch`,
  `flushSync`.
- Templates и directives: `html`, `render`, `each`, `list`, `unsafeHTML`,
  `ref`, `classMap`, `styleMap`.
- Components и CSS: `component`, `css`, `cssVars`.
- Routing и pages: `routes`, `router`, `page`, `layout`, `nested`,
  `navigate`, `queryParam`, `prefetchPath`.
- Data: `resource`, `mutation`, `invalidate`, `jsonFetcher`, `HttpError`.
- Forms: `useForm`.
- Head и persistence: `applyHead`, `persisted`.
- Context: `createContext`, `provide`, `inject`.
- Advanced lifecycle helpers: `createLifecycle`, `runInLifecycle`,
  `getCurrentLifecycle`.
- Публичные TypeScript-типы, экспортируемые из `@madojs/mado`.

## Внутреннее или нестабильное

Это не публичный API:

- Package subpaths кроме `@madojs/mado`, `@madojs/mado/devtools.js` и
  `@madojs/mado/vite`.
- Internals парсера/биндингов: `html/parser.js`, `html/bindings.js`,
  `ChildState`, `EachEntry`.
- Internals роутера: `router/match.js`, `router/navigation.js`,
  `router/manifest.js`.
- Diagnostics internals и все `_testHooks`.
- Точный текст bundle, имена chunks и внутренняя структура файлов.

Тесты репозитория могут импортировать внутренние файлы через относительные
пути `dist/`. Код приложений так делать не должен.

## Что может меняться

Patch и minor релизы могут добавлять root exports, опции, diagnostics, docs или
starter files. Они также могут менять internals, форму bundle и детали
реализации, если стабильный API и задокументированное поведение остаются
совместимыми.

Ломающие изменения стабильного API требуют major version.
