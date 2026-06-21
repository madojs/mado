# Карта замороження API

> Що є публічним, що внутрішнім, і що SemVer захищатиме у v1.

Контракт Mado v1 навмисно невеликий. Код застосунку імпортує API з кореня
пакета:

```ts
import { component, html, resource, routes, signal } from "@madojs/mado";
```

Єдиний публічний subpath — side-effect модуль devtools:

```ts
import "@madojs/mado/devtools.js";
```

Усе інше під `dist/src/` — деталь реалізації, навіть якщо файл видно в
репозиторії.

## Стабільний публічний API

Ці імена публічні й захищаються SemVer після v1:

- Reactivity: `signal`, `computed`, `effect`, `untracked`, `batch`,
  `flushSync`.
- Templates і directives: `html`, `render`, `each`, `list`, `unsafeHTML`,
  `ref`, `classMap`, `styleMap`.
- Components і CSS: `component`, `css`, `cssVars`.
- Routing і pages: `routes`, `router`, `page`, `layout`,
  `navigate`, `queryParam`, `prefetchPath`.
- Data: `resource`, `mutation`, `invalidate`, `jsonFetcher`, `HttpError`.
- Forms: `useForm`.
- Head і persistence: `applyHead`, `persisted`.
- Context: `createContext`, `provide`, `inject`.
- Advanced lifecycle helpers: `createLifecycle`, `runInLifecycle`,
  `getCurrentLifecycle`.
- Публічні TypeScript-типи, експортовані з `@madojs/mado`.

## Внутрішнє або нестабільне

Це не публічний API:

- Package subpaths крім `@madojs/mado` і `@madojs/mado/devtools.js`.
- Internals parser/binding: `html/parser.js`, `html/bindings.js`,
  `ChildState`, `EachEntry`.
- Internals router: `router/match.js`, `router/navigation.js`,
  `router/manifest.js`.
- Diagnostics internals і всі `_testHooks`.
- Точний текст bundle, назви chunks і внутрішня структура файлів.

Тести репозиторію можуть імпортувати internal files через відносні шляхи
`dist/`. Код застосунків не повинен цього робити.

## Що може змінюватися

Patch і minor releases можуть додавати root exports, options, diagnostics, docs
або starter files. Вони також можуть змінювати internals, форму bundle і деталі
реалізації, якщо stable API та задокументована поведінка лишаються сумісними.

Breaking changes стабільного API потребують major version.
