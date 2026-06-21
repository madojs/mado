# Static Bake & SEO

Mado навмисно не робить SSR із hydration. Для SEO-сторінок є `bake`: build-time
prerender у статичний HTML із meta-тегами, JSON-LD і baked data.

## Коли підходить

- Блог, документація, landing pages.
- Невеликі каталоги з кінцевим набором сторінок.
- Сторінки, де crawlers мають одразу побачити контент.
- Контент не персоналізований для конкретного користувача.

## Коли не підходить

- Авторизовані dashboards.
- Персоналізований HTML.
- Real-time дані.
- Каталоги, які потребують справжнього server rendering на кожен запит.

## Сторінка з bake

```ts
import { page, html } from "@madojs/mado";

export default page<{ slug: string }, Product>({
  title: ({ slug }) => `Product ${slug}`,
  head: ({ slug }, data) => ({
    description: data?.description ?? `Product ${slug}`,
  }),
  bake: {
    paths: () => products.map((p) => ({ slug: p.slug })),
    data: ({ slug }) => findProduct(slug),
    revalidate: 3600,
  },
  view: ({ params }) => html`<x-product data-slug=${params.slug}></x-product>`,
});
```

`bake.paths()` повертає всі params, `bake.data()` повертає дані для конкретної
сторінки, `head()` формує SEO-метадані.

## Edge prerender

Для великих наборів сторінок можна робити той самий підхід на edge: Cloudflare
Worker генерує HTML на cache miss, кладе в KV і віддає з TTL.

Це не hydration. Клієнтський Mado-застосунок все одно стартує нормально і
перерендерює сторінку після завантаження.
