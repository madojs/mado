# Smart Static (`bake`)

> Выпекание HTML для SEO без runtime SSR. **Идея: данные и view в одном файле, статика на выходе.**

`bake` — это **build-time prerender**, не SSR. На выходе — статические `*.html` файлы, которые любой nginx/Cloudflare раздаёт как обычную статику. На клиенте Web Components оживают и работает SPA-навигация дальше.

---

## Когда `bake` подходит

- **Маркетинговые страницы**: лендинги, landing/sub-landings под рекламные кампании, страницы продуктов.
- **Каталог с относительно стабильным набором страниц**: блог, документация, портфолио, e-commerce до **~10k SKU** с обновлениями реже раза в час.
- **Контент, общий для всех пользователей**: вся страница одинакова для гостя и для авторизованного юзера (или авторизация дорисовывается через `effect()` уже на клиенте).
- Нужен **хороший SEO** (rich snippets, OG, JSON-LD) и **быстрый first paint** без поднятия node-серверов в проде.

## Когда `bake` **не** подходит

- **Сотни тысяч страниц с частыми изменениями**. `bake` обходит все `paths` синхронно за один прогон. На 100k+ страниц это минуты ребилда, и инвалидация одной страницы либо требует полного rebake, либо отдельной CI-логики (см. ниже про точечный revalidate).
- **Персонализированный контент в HTML**. Если на странице должно быть "Привет, Иван" в `<title>` или в meta — это не для `bake`. Авторизованный кабинет, личный фид, корзина с реальными ценами для юзера — оставляйте SPA.
- **Нужны server-only API в render**: cookies, headers, реальные сетевые запросы к закрытым API. На bake-стороне доступен только `linkedom`, никакого Node-окружения для компонентов.
- **A/B-тесты и flag'и, которые меняют разметку в первом paint**. `bake` зафиксирует один вариант. Динамику делайте на клиенте через `effect()`.
- **Real-time / часто меняющиеся данные** (биржевые котировки, остатки на складе минута-в-минуту). `bake.revalidate` — это метаданные, не runtime: фреймворк сам ничего не перевыпекает.
- Контент **под авторизацией** (admin, internal tools). Незачем; используйте SPA-режим.

---

## Концепция

`page({...})` имеет четыре опциональных слота, относящихся к `bake`:

- `head` — meta, OG, JSON-LD.
- `bake.paths` — список URL-параметров для генерации (build-time, может быть `async`).
- `bake.data` — данные для конкретного URL (build-time, может быть `async`).
- `bake.revalidate` — через сколько секунд кэш устарел (записывается в `<meta>`, реальную инвалидацию решает ваша CI/CDN).

Команда `npm run bake` обходит все `page` с `bake`, генерит HTML через `linkedom`, складывает в `out/<path>/index.html`. **Никакого Chromium не нужно** — `linkedom` весит ~50 КБ.

---

## Пример

```ts
// src/pages/product.ts
import { page, component, html } from "@madojs/mado";
import { findProduct, products, type Product } from "../lib/products.js";

component("x-product-page", ({ host }) => {
  return () => {
    const p = findProduct(host.dataset.slug);
    return p
      ? html`<h1>${p.name}</h1><p>${p.description}</p>`
      : html`<p>Не найдено.</p>`;
  };
});

export default page<{ slug: string }, Product | undefined>({
  title: ({ slug }) => `${findProduct(slug)?.name} — MyShop`,

  head: ({ slug }, baked) => {
    const p = baked ?? findProduct(slug);
    if (!p) return {};
    return {
      description: p.description,
      canonical: `/product/${p.slug}`,
      og: { title: p.name, image: p.image, type: "product" },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        offers: { "@type": "Offer", price: p.price, priceCurrency: p.currency },
      },
    };
  },

  bake: {
    paths: () => products.map((p) => ({ slug: p.slug })),
    data: ({ slug }) => findProduct(slug),
    revalidate: 3600,
  },

  view: ({ params }) =>
    html`<x-product-page data-slug=${params.slug}></x-product-page>`,
});
```

```ts
// src/routes.ts
import { routes, type RoutesMap } from "@madojs/mado";

// Экспортируем И default (RouterApi для рантайма), И manifest (для bake-скрипта).
export const manifest: RoutesMap = {
  "/": () => import("./pages/home.js"),
  "/product/:slug": () => import("./pages/product.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, { titleSuffix: " · MyShop" });
```

## Запуск

```bash
npm install -D linkedom vite
npm run build
npm run bake
```

Получаешь:

```
out/
├── product/
│   ├── mado-mug/index.html        ← HTML с meta + JSON-LD
│   ├── raw-bundler/index.html
│   └── shadow-dom/index.html
└── sitemap.xml
```

## Что внутри сгенерированного HTML

```html
<head>
  <title>Mado-кружка — MyShop</title>
  <meta name="description" content="..." data-mado-head="baked">
  <link rel="canonical" href="/product/mado-mug" data-mado-head="baked">
  <meta property="og:title" content="Mado-кружка" data-mado-head="baked">
  <meta property="og:image" content="..." data-mado-head="baked">
  <script type="application/ld+json" data-mado-head="baked">
    {"@context":"https://schema.org","@type":"Product","..."}
  </script>
  <meta name="bake-revalidate" content="3600" data-mado-head="baked">
</head>
<body>
  <div id="app">
    <x-product-page data-slug="mado-mug">
      <h1>Mado-кружка</h1>
      <p>Кружка с надписью «zero dependencies».</p>
      <strong>12 EUR</strong>
    </x-product-page>
  </div>

  <!-- предзагруженные данные для гидрации -->
  <script id="bake" type="application/json">
    {"slug":"mado-mug","name":"Mado-кружка","price":12,"..."}
  </script>

  <script type="module" src="/assets/index-HASH.js"></script>
</body>
```

После загрузки JS:

1. Web Components `<x-product-page>` оживают (браузер уже знает кастомные элементы).
2. `page.load()` получает `baked` как initialData — никаких лишних `fetch`.
3. SPA-навигация работает дальше как обычно.

---

## Cookbook: типовые сценарии

### Блог (Markdown → bake)

```ts
// src/lib/posts.ts
import { readdirSync, readFileSync } from "node:fs";
// (этот модуль импортируется только из bake-скрипта,
// в браузере не должен попасть в граф — выносите в lib/server/ или ifdef'ьте)

export const allPosts = () =>
  readdirSync("content/blog").map((file) => ({
    slug: file.replace(/\.md$/, ""),
    ...parseFrontmatter(readFileSync(`content/blog/${file}`, "utf-8")),
  }));
```

```ts
// src/pages/blog-post.ts
import { page, html } from "@madojs/mado";
import { allPosts } from "../lib/posts.js";

export default page<{ slug: string }>({
  title: ({ slug }) => allPosts().find((p) => p.slug === slug)?.title ?? slug,
  head: ({ slug }, post) => ({
    description: post?.excerpt,
    canonical: `/blog/${slug}`,
    og: { title: post?.title, type: "article" },
  }),
  bake: {
    paths: () => allPosts().map(({ slug }) => ({ slug })),
    data: ({ slug }) => allPosts().find((p) => p.slug === slug),
  },
  view: ({ params }) =>
    html`<x-blog-post data-slug=${params.slug}></x-blog-post>`,
});
```

### Каталог продуктов (e-commerce, ≤ 10k SKU)

- `bake.paths` → SELECT slug FROM products
- `bake.data` → SELECT * FROM products WHERE slug=?
- Полная инвалидация раз в N часов через cron + `npm run bake`
- Точечная инвалидация одного товара: webhook → пересборка только этого `paths`

### Документация

- `bake.paths` — обход файловой системы `docs/**/*.md`
- `bake.data` — парсинг Markdown
- `head.jsonLd` — `TechArticle`

---

## Revalidate / CDN

`bake.revalidate: 3600` пишет в HTML `<meta name="bake-revalidate" content="3600">`. Это **метаданные** — фреймворк сам ничего не перевыпекает. Стратегии:

1. **Простейший вариант**: cron в CI — `npm run bake && rsync out/ origin:/var/www/`.
2. **Через CDN** (Cloudflare/Fastly): кладёте HTML с `Cache-Control: max-age=3600`. CDN сам инвалидирует.
3. **Webhook-триггер**: API magazin → POST `/_revalidate?path=/product/mado-mug` → CI пере-выпекает только эту страницу (можно сделать `bake.paths`, который возвращает точечный список по env-параметру).

---

## Сравнение с альтернативами

|                          | Next.js SSG/ISR    | playwright-prerender | **mado bake** |
|--------------------------|--------------------|----------------------|-----------------|
| Нужен Chrome в CI        | нет                | **да** (~300 МБ)     | **нет**         |
| Нужен node в проде       | для ISR            | нет                  | **нет**         |
| Время на 1000 страниц    | минуты             | минуты               | **секунды**     |
| Magic-уровень            | high               | low                  | **zero**        |
| HTML-парсер              | React-renderer     | браузер              | linkedom (~50 КБ) |
| Конфигурация             | next.config.js + … | один скрипт          | один скрипт     |
| Источник правды view+data | разные             | страница             | **одна страница** |

---

## Ограничения и подводные камни

- **В bake-стороне нет браузера.** Не работают: `setTimeout` (точнее работает, но bake завершается раньше), `fetch` к относительным URL, любые `effect()`/`signal()` побочки, реальные `requestAnimationFrame`. Render-функция должна быть детерминирована от `params` / `data`.
- **`linkedom` ≠ браузер.** Не все API DOM поддержаны (например, `HTMLElement.click()` ведёт себя проще). Тяжёлая логика в Web Components будет выполнена только в браузере после `connectedCallback`; в baked HTML попадёт только то, что синхронно отрендерилось при первом проходе.
- **Динамичный контент дорисовывайте на клиенте.** Текущее время, A/B-тест, гео-баннер, корзина юзера — не должны быть в выпеченном HTML. Используйте `effect()` для дорисовки.
- **Серверные импорты не должны попадать в клиентский граф.** Если `lib/posts.ts` импортит `node:fs`, его нельзя импортить из `view`. Держите такие модули в отдельной папке (`lib/build/`) и используйте только из `bake.paths`/`bake.data`.
- **`paths` и `data` исполняются на каждый bake-прогон.** Если за ними тяжёлый запрос к БД — кешируйте на уровне скрипта.

---

## TL;DR

Если страница **общая для всех пользователей**, имеет **относительно стабильный набор URL'ов** и важен **SEO + первый paint** — добавьте `bake: { paths, data }` и получите статический HTML с meta/JSON-LD/sitemap за миллисекунды. Без node-сервера, без Chrome, без магии.

Если страница персонализирована, или URL'ов миллион, или контент меняется в реальном времени — `bake` не ваш инструмент. Оставляйте SPA или подключайте отдельный SSR-фреймворк.
