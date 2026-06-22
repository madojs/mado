Я бы оформил это как **финальную программу перед merge**, а не как очередной набор точечных фиксов.

Ветка уже изменила сам продуктовый контракт Mado: это больше не “SPA для внутренних тулов с дополнительным bake”, а единая модель для публичных сайтов и приложений. Приложенный технический review тоже правильно сводит оставшуюся работу к доказательству полного snapshot → live round-trip, base-path контракту и синхронизации документации с реальным API. 

# Mado Unified Framework — pre-merge plan

## 1. Зафиксировать продуктовый контракт

Это больше не обсуждаем в ходе реализации:

```txt
Mado component
  = Custom Element + open Shadow DOM

Mado page
  = route + load + head + view + optional static declaration

Mado release
  = Vite build
  + browser-rendered static documents
  + Declarative Shadow DOM
  + SPA fallback
  + deployment artifact

Client activation
  = atomic takeover
  != hydration
  != SSR reconciliation
```

Позиционирование:

> **Mado is a calm native-first web framework for sites and apps.**

Подзаголовок:

> Build with real Web Components, signals, routing, data and forms.
> Ship live SPAs and browser-rendered static documents from one component model.

Короткая формула:

> **One component model. One page model. One release command.**

Важно не перейти в другую крайность: Mado становится general-purpose **для сайтов и клиентских приложений**, но не full-stack meta-framework. Он не начинает владеть сервером, базой данных, SSR, RPC и cloud runtime.

---

# 2. Обязательные технические задачи до merge

## 2.1 Настоящий production-served takeover E2E

Сейчас snapshot доказан хорошо, но live-часть теста всё ещё помечена как best-effort: итоговый HTML загружается через `setContent()`, импорт `/src/main.ts` не имеет Vite server, timeout поглощается, а строгие утверждения про setup/fetch отсутствуют.

Нужно поднять сервер над реальным `out/` и открыть:

```txt
http://127.0.0.1:<port>/
```

Тест обязан строго проверить:

```txt
setup() компонента вызван ровно один раз
resource fetch выполнен 0 раз при наличии seed
#app больше не содержит data-mado-static
seed script удалён после consume
в DOM один product-card
в Shadow Root одна .card
button click обновляет signal и текст
нет render-unmanaged-dom
нет [mado:*] console warnings/errors
нет дублированного live/static дерева
```

Fixture должен содержать:

```txt
static page
nested layout
outer Shadow Component
inner Shadow Component
slot
component CSS
ctx.attr()
resource(initialData: seed)
reactive button
head metadata
```

Это главный merge gate.

## 2.2 Полная поддержка Vite `base`

Сейчас `site + base` участвуют в sitemap, но capture server и router всё ещё работают с физическим `location.pathname` как с route pathname. Capture server также ищет `/project/assets/x.js` как `out/project/assets/x.js`, хотя файл лежит в `out/assets/x.js`.

Нужно ввести один внутренний base contract:

```ts
normalizeBase()
stripBase()
withBase()
```

Router:

```txt
browser pathname → stripBase → route matching
route pathname → withBase → history.pushState
```

Capture server:

```txt
/base/assets/* → out/assets/*
/base/docs → route /docs
```

Internal links тоже должны учитывать base. Я бы не переписывал произвольные `href` магически, а добавил один маленький helper:

```ts
import { routeUrl } from "@madojs/mado";

html`<a data-link href=${routeUrl("/docs")}>Docs</a>`;
```

Starter должен использовать его везде.

Fixture:

```ts
base: "/mado/"
```

Проверяет:

```txt
/mado/docs открывается
/mado/assets/*.js загружается
route matcher видит /docs
SPA navigation работает
открытие ссылки в новой вкладке работает
canonical = https://example.test/mado/docs
sitemap содержит тот же URL
private fallback работает
```

## 2.3 Автоматический canonical и `og:url`

Если `page.head()` не вернул canonical, static output должен автоматически получить:

```txt
site + base + pathname
```

Пользовательский canonical имеет приоритет.

То же разумно сделать для отсутствующего:

```html
<meta property="og:url">
```

Перед сохранением output валидировать:

```txt
canonical абсолютный
нет localhost
нет 127.0.0.1
нет capture-server origin
нет дублирующихся canonical
```

Сейчас `applyHead()` добавляет canonical только при явном `meta.canonical`.

## 2.4 Strict `JsonValue` validator

Публичные типы уже правильно описывают только JSON-safe данные.

Но runtime-проверка через один `JSON.stringify()` недостаточна:

```txt
Date      → строка
Map       → {}
Set       → {}
NaN       → null
Infinity  → null
undefined → тихо исчезает
```

Нужен рекурсивный validator:

```txt
только plain object
только arrays
finite numbers
никакого undefined
никаких class instances
никаких cycles
```

Ошибка должна показывать точный путь:

```txt
[mado:static] /products/keyboard:
seed.product.createdAt is Date; expected JsonValue.
```

## 2.5 Static output hardening

Довести staging до честной модели:

```txt
discovery
capture во внешний temp
полная verification
promotion
cleanup в finally
```

Не менять `out/_mado/spa.html` до успешного discovery/capture.

Дополнительно:

* удалять `_mado/build.json` после использования;
* не оставлять temp при ошибке;
* promotion делать только после успешной проверки всех routes;
* user-owned `_headers`, `_redirects`, `404.html` сохранять через `writeIfMissing`;
* логировать используемые Chrome path/version;
* determinism обещать только в pinned environment.

## 2.6 Readiness и HTTP policy

`whenStable()` должен иметь отдельные timeouts для:

```txt
document.fonts.ready
requestAnimationFrame ticks
route readiness
critical resources
```

Нужно зафиксировать правило:

```txt
resource, созданный до первого routeReady
  = initial/critical, capture ждёт

resource после routeReady
  = background, snapshot не блокируется
```

Для HTTP:

```txt
fatal:
  document
  script
  stylesheet
  route-critical fetch/resource

warning:
  необязательная image/font/media
```

Либо оставить режим “любой 4xx fatal”, но тогда это должно быть публично задокументировано как strict snapshot policy.

## 2.7 Browser E2E не должен skip-аться в PR CI

Локально тест может skip-аться без Chrome. В обязательном CI job — нет.

PR в `main` должен иметь required check:

```txt
static-snapshot
```

С:

```txt
pinned Chrome
MADO_BROWSER_PATH
full DSD round-trip test
base-path test
release determinism test
```

Иначе самая важная архитектура будет необязательной.

---

# 3. Уточнить CLI перед документацией

Сейчас исторический смысл `mado build` — `tsc`, но новая продуктовая модель уже Vite-first. README всё ещё описывает `mado build` как tsc compile.

Для пользовательского приложения я бы закрепил:

```txt
mado dev
  Vite dev server

mado build
  production Vite SPA build

mado static
  low-level/debug command:
  snapshot an existing build

mado release
  typecheck + build + static + deployment files + compression

mado preview
  serve final out/
```

Framework repo может вызывать `tsc` напрямую через внутренний npm script:

```json
"build:framework": "tsc"
```

Но публичная CLI-команда `build` не должна значить “скомпилировать TS, но не построить deployable app”.

Starter scripts:

```json
{
  "scripts": {
    "dev": "mado dev",
    "build": "mado build",
    "release": "mado release",
    "preview": "mado preview",
    "typecheck": "mado typecheck"
  }
}
```

Это также решает DX-проблему: обычный `npm run build` не требует production `site`, а `npm run release` требует его осознанно.

---

# 4. Мой разбор исторического starter

## Что в нём действительно сильное

Текущий starter — не плохой. Наоборот, это хорошая **reference architecture для long-lived business application**.

В нём отлично сделаны:

* единый `app.routes.ts` как карта приложения;
* зоны, layouts и guards определяются централизованно;
* business modules не выбирают собственный shell;
* auth и billing разделены;
* reusable UI вынесен отдельно;
* global CSS разделён на tokens/reset/shell/content;
* service modules используют ES-module identity как singleton;
* billing демонстрирует resource, mutation, permissions, tables и keyed `each`.

То есть удалять его было бы ошибкой.

## Почему он больше не должен быть default

Его README прямо называет starter каноничной формой для admin panels, internal tools и long-lived SPA.

Это теперь сужает новое позиционирование Mado.

Кроме того:

* первый проект сразу содержит auth, billing, invoices, permissions и API boundary;
* без backend часть экранов не является полноценным runnable experience;
* структура с modules/connectors/contracts/boundaries слишком тяжела для landing/docs/store;
* человек, который хочет сделать сайт, получает enterprise skeleton;
* ссылки в starter не имеют `data-link`, хотя router перехватывает только `a[data-link]`, поэтому starter фактически демонстрирует full-page navigation вместо SPA navigation.
* starter сейчас имеет `"build": "mado release"`, а public home уже `static: true`, при этом `site` в Vite config только закомментирован. Новый пользователь закономерно получит failing build без объяснённого deployment config.

## Рекомендация: оставить два starter-а, но один mental model

Это не создаёт два способа писать Mado. Отличается только количество заранее созданной структуры.

### Default: universal starter

```bash
mado init my-app
```

Минимальный, полностью runnable, без backend.

Примерная структура:

```txt
src/
  main.ts
  app.routes.ts

  pages/
    home.page.ts
    guide.page.ts
    app.page.ts
    not-found.page.ts

  components/
    feature-card.component.ts
    live-counter.component.ts

  content/
    guides.ts

  styles/
    tokens.css
    reset.css
    document.css
```

Routes:

```txt
/
  public static landing

/guide/:slug
  dynamic static page
  seed из локального browser-safe content module

/app
  SPA-only interactive page

*
  not found
```

Starter должен доказать:

```txt
один Shadow Component используется на landing и в app
static.initialData
page.head
dynamic static paths
signal
resource with seed
routeUrl + data-link
static snapshot
SPA fallback
```

Никакого внешнего API. Всё запускается сразу после `npm install`.

Размер — примерно 10–15 source files, не 40.

### Advanced: modular starter

```bash
mado init my-app --starter modular
```

Сюда переносится текущий starter:

```txt
auth
billing
layouts
guards
services
connectors
module boundaries
shared HTTP
generators
```

Обновления для него:

* переименовать README в “Reference architecture for modular business applications”;
* добавить mock API adapter по умолчанию;
* real HTTP adapter оставить как явную замену;
* добавить `data-link` и base-aware `routeUrl()`;
* отделить `build` от `release`;
* public home оставить static;
* private billing не включать в sitemap;
* показать fixed public route + guarded SPA zone;
* сохранить CSS layering и module boundaries.

Большие визуальные demos остаются во внешнем repo/site.

Два starter-а — максимум. Не возвращаться к зоопарку:

```txt
minimal
crud
admin
docs
shop
dashboard
```

Один universal и один modular достаточно.

---

# 5. Реорганизация документации

Сейчас README содержит старые утверждения:

* Mado — SPA framework для internal tools;
* Vite не требуется;
* SEO-heavy sites не подходят;
* нужно использовать bake;
* production pipeline включает bake.

Это нельзя мержить в `main` вместе с новым runtime: документация будет противоречить продукту.

## Source-of-truth

```txt
README
  позиционирование
  quick start
  минимальная модель
  ссылки

docs/en
  каноническая подробная документация

llms.txt
  компактная machine-readable спецификация

AGENTS.md
  правила изменения framework repo и генерации Mado-кода

docs/fr, docs/uk, docs/ru
  переводы английского канона
```

Не дублировать полное API одновременно в README, llms и четырёх docs.

## Новая структура

```txt
docs/en/
  README.md

  00-the-mado-way.md
  01-getting-started.md
  02-pages-and-routing.md
  03-components-and-shadow-dom.md
  04-templates-and-reactivity.md
  05-data-resources-mutations.md
  06-forms.md
  07-styling.md
  08-static-snapshots.md
  09-release-and-deployment.md
  10-project-architecture.md
  11-testing-and-diagnostics.md
  12-ai-agents.md
  13-migration-0.12.md

  recipes/
    public-product-page.md
    markdown-docs-site.md
    auth-and-private-routes.md
    shared-domain-browser-server.md
    social-previews.md
    cloudflare-pages.md
    github-pages-base-path.md

  reference/
    page.md
    component.md
    templates.md
    signals.md
    router.md
    resource.md
    forms.md
    cli.md
```

## Ключевой новый документ

`08-static-snapshots.md` должен объяснять:

```txt
почему Google понимает Web Components
зачем snapshot всё равно нужен
что такое Declarative Shadow DOM
почему это не SSR
почему это не hydration
как работает seed
почему static callbacks browser-safe и secret-free
что делает site/base
какой Chromium нужен
что увидит браузер без JS
что увидят social preview bots
ограничения canvas/media/client-only state
```

## ADR вместо 994-строчного плана в корне

`MADO_UNIFIED_SNAPSHOT_PLAN.MD` лучше после завершения убрать из корня и превратить в:

```txt
docs/architecture/adr/0001-browser-static-snapshots.md
```

Формат:

```txt
Context
Decision
Alternatives rejected
Consequences
Known limits
```

Полный рабочий план можно оставить в PR discussion или issue history.

## Migration guide

Пусть pre-v1 не требует compatibility layer, но человек всё равно должен понимать замену:

```txt
page.bake → page.static
mado bake → mado static
out/baked → direct route documents
#bake → data-mado-static-data
shadow:false больше не SEO strategy
site обязателен для static routes
Vite plugin становится каноничным
mado build меняет значение
```

## Docs lint

Добавить `npm run docs:check`, который ищет запрещённые устаревшие термины:

```txt
page.bake
mado bake
out/baked
#bake
"No Vite required"
"SEO-heavy public sites are not supported"
shadow:false как SEO-рекомендация
"internal tools only"
```

Также проверять broken relative links и соответствие docs index.

English docs замораживаются первыми, затем переводятся FR/UK/RU. В каждом переводе можно хранить source revision:

```txt
Translated from English docs revision: <commit>
```

---

# 6. Новое позиционирование во всех поверхностях

## README hero

```md
# Mado

> A calm native-first web framework for sites and apps.

Build with real Web Components, signals, routing, data and forms.
Ship live SPAs and browser-rendered static documents from one component model.

**One component model. One page model. One release command.**
```

## Что использовать вместо старой ниши

Use cases:

```txt
public landing pages
documentation sites
product/catalog pages
SaaS applications
business applications
admin panels and internal tools
dashboards
embedded widgets
```

Internal tools остаются сильным proof point, а не единственной идентичностью.

## Честные границы

```txt
No server renderer
No hydration protocol
No framework compiler
No runtime dependencies
No built-in backend
No UI-kit marketplace
Modern evergreen browsers
Compatible Chromium required at release time for static routes
Static callbacks must be browser-safe and secret-free
```

## Vite phrasing

Удалить:

> No Vite required.
> You run tsc and open the browser.

Заменить:

> Browser-native source, with Vite as the development and delivery transport.
> No framework-specific compiler and zero runtime dependencies.

## Обновить

```txt
README
package.json description
npm keywords
GitHub description
GitHub topics
starter READMEs
llms.txt
AGENTS.md
CHANGELOG
website copy
release notes
```

Текущее описание package всё ещё называет Mado SPA framework для internal/admin/business apps.

Предлагаемый package description:

```txt
A calm native-first web framework for sites and apps.
Web Components, signals, routing, data, forms and browser-rendered static snapshots.
Zero runtime dependencies.
```

---

# 7. Последовательность реализации

```txt
1. test(static): add production-served snapshot-to-live takeover gate
2. fix(router): make routing, navigation and links Vite-base aware
3. fix(static): make capture server and preview base-aware
4. fix(static): add canonical and og:url fallback
5. fix(static): enforce strict JsonValue validation
6. refactor(static): finalize staging, cleanup and HTTP readiness policy
7. refactor(cli)!: make build mean Vite app build
8. ci(static): require pinned-browser snapshot tests
9. feat(starter): add universal default starter
10. refactor(starter): preserve current app as modular starter
11. docs: rewrite English canonical documentation
12. docs: update README, llms, AGENTS and migration guide
13. docs: synchronize FR, UK and RU
14. chore: update package metadata and repository positioning
15. chore: archive snapshot plan as ADR
```

---

# 8. Dogfooding перед merge

Установить branch tarball в `madojs/site`:

```bash
npm pack
npm install ../madojs-mado-0.12.0-rc.tgz
```

Сайт должен содержать:

```txt
/
  static landing

/docs/:slug
  dynamic static markdown pages

/demo
  SPA-heavy interactive route

/private-test
  SPA fallback route, не в sitemap
```

Проверить:

```txt
curl возвращает title/meta/content/DSD
JS disabled показывает страницу
JS enabled выполняет один takeover
direct nested refresh работает
social preview metadata в raw head
Cloudflare preview работает
GitHub Pages base-path preview работает
никаких localhost URL
никаких duplicate nodes
никаких console warnings
```

Только после этого merge в `main`.

---

# 9. Финальный merge gate

```txt
□ production-served takeover E2E строгий, без catch
□ setup ×1
□ initial fetch ×0 при seed
□ interactive binding работает после takeover
□ base-path fixture зелёный
□ canonical/og:url автоматические
□ strict JsonValue errors path-aware
□ static snapshot CI не skip-ается
□ default universal starter работает без backend
□ modular starter работает с mock adapter
□ npm run build работает без site
□ npm run release требует site только для static
□ raw HTML полезен без JS
□ private routes используют SPA fallback
□ documentation не содержит старого bake model
□ README/package/llms/AGENTS согласованы
□ madojs/site успешно собран этой веткой
□ package smoke и полный test suite зелёные
□ release output deterministic в pinned environment
```

После merge я бы выпустил не сразу stable, а:

```txt
0.12.0-rc.1 → npm dist-tag next
```

Неделя dogfooding на сайте и modular starter, затем:

```txt
0.12.0 → latest
```

Мой общий вывод: текущий исторический starter нужно **сохранить и повысить в статусе modular reference architecture**, но убрать с позиции default. Новый default должен за пять минут показать главное обещание нового Mado: один Shadow Component работает на публичной static-странице и в живом SPA без другого component mode, SSR и hydration.
