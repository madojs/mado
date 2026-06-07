# Routing

> Один файл-манифест. Никаких сканеров папок. Никаких спецсимволов.

## Зачем не file-based

В Next/SvelteKit/SolidStart роут возникает «магически» по имени файла. У этого есть плюсы (видно структуру URL по `pages/`), но в проде это означает:

- Невидимый плагин-сканер в билде. Без него файлы — просто файлы.
- Спецсимволы в путях: `[id]`, `(group)`, `_layout`, `+page.svelte`, `...slug`.
- Server-route vs client-route путаются.
- Тестировать роутинг — мука: нужен эмулятор сборщика.

Mado считает это **слишком магией**. Мы делаем иначе.

## Манифест

Один файл — `src/routes.ts`. В нём один объект. Читается сверху вниз.

```ts
// src/routes.ts
import { routes } from 'madojs';

export default routes({
  '/':              () => import('./pages/home.js'),
  '/about':         () => import('./pages/about.js'),
  '/users/:id':     () => import('./pages/user-profile.js'),
  '/users/:id/edit':() => import('./pages/user-edit.js'),
  '*':              () => import('./pages/not-found.js'),
});
```

Хочешь увидеть все роуты? Открой `routes.ts`. Никаких сюрпризов.

## Что справа от пути

Любая запись — это **одно из трёх**:

### 1. Lazy import (рекомендовано)

```ts
'/posts': () => import('./pages/posts.js'),
```

- Браузер сам сделает chunk при бандлинге (esbuild --bundle --splitting).
- Модуль загрузится только при заходе на роут.
- Между навигациями результат кэшируется.

### 2. Готовая Page (eager)

```ts
import about from './pages/about.js';

'/about': about,
```

Сразу в графе, без задержек. Используй для критичных страниц (home, login).

### 3. Nested с layout

```ts
import { routes, nested } from 'madojs';

export default routes({
  '/': () => import('./pages/home.js'),

  '/admin/*': nested({
    layout: () => import('./layouts/admin.js'),
    routes: {
      '':       () => import('./pages/admin/dashboard.js'),
      'users':  () => import('./pages/admin/users.js'),
      'logs':   () => import('./pages/admin/logs.js'),
    },
  }),
});
```

Layout — это **обычный** `page({...})`, который рендерит `ctx.child` куда хочет:

```ts
// src/layouts/admin.ts
import { page, html, css, component } from 'madojs';

export default page({
  view: ({ child }) => html`
    <div class="admin">
      <aside><nav>...</nav></aside>
      <main>${child}</main>
    </div>
  `,
});
```

## Контракт страницы

```ts
import { page, html, resource, jsonFetcher } from 'madojs';

export default page({
  title: ({ id }) => `User #${id}`,        // string | (params) => string
  load:  ({ id }) => resource(...),         // опц., возвращает Resource или данные
  view:  ({ params, data, path, child }) => html`...`,  // ОБЯЗАТЕЛЬНО
});
```

Три слота, всё. Если ты экспортируешь не `page({...})`, а просто функцию — `routes()` кинет понятную ошибку:

```
[Mado] Lazy-роут не вернул page({...}) как default-экспорт.
```

## Параметры URL

```ts
'/users/:id': () => import('./pages/user.js'),
```

```ts
export default page<{ id: string }>({
  title: ({ id }) => `User ${id}`,
  view:  ({ params }) => html`<h1>${params.id}</h1>`,
});
```

Типы передаются в `page<Params>` — `tsc` проверит что вы не обратились к `params.foo`, которого нет в роуте.

## Глобальные опции

```ts
export default routes(
  { '/': home, '/about': about, '*': nf },
  {
    titleSuffix: ' · MyApp',                       // → "Главная · MyApp"
    loading: () => html`<x-spinner/>`,             // пока модуль грузится
    error:   (err) => html`<x-fatal-error .err=${err}/>`,
  },
);
```

## Программная навигация

```ts
import route from './routes.js';

route.navigate('/posts');
route.navigate('/posts?page=2');
route.navigate('/posts', { replace: true });
```

Клики по `<a href="/foo" data-link>` перехватываются глобально (без атрибута — браузер сделает full reload, как и положено для внешних ссылок).

## Query-параметры

```ts
import { queryParam } from 'madojs';

const page = queryParam('page', '1');
page();              // '1'
page.set('2');       // history.replaceState + перерисовка
page.set(null);      // удалить параметр
page.set('3', { push: true });   // history.pushState
```

`queryParam` — обычный сигнал. Использовать можно где угодно: в страницах, компонентах, computed.

## Что осознанно отсутствует

- ❌ Авто-сканирование `pages/`. **Один файл-манифест явный**.
- ❌ Спецсимволы в путях (`[id]`, `(group)`, `_layout`). **Параметры — только `:name`, ничего больше**.
- ❌ Server-side роутинг в этом же манифесте. Mado — клиентский фреймворк.
- ❌ Auto-prefetch при наведении. Если очень нужно — можно сделать вручную: `link.addEventListener('mouseenter', loader)`. Но обычно лишнее.

## FAQ

**А если у меня 100 роутов? Не разрастётся ли файл?**
Разрастётся до ~150 строк. Это всё ещё **один источник правды** против сотни файлов в `pages/` с магическими именами. На практике даже у больших проектов (1000+ страниц) можно бить на feature-манифесты:

```ts
import { routes } from 'madojs';
import adminRoutes from './features/admin/routes.js';
import billingRoutes from './features/billing/routes.js';

export default routes({
  ...adminRoutes,
  ...billingRoutes,
  '*': () => import('./pages/not-found.js'),
});
```

**Как тестировать роутинг?**
Импортируешь `routes.ts` — это просто объект. Подставляешь свой mock-router. Никакой эмуляции сборщика не нужно.

**Code splitting работает?**
Да. При `esbuild --bundle --splitting --format=esm` каждый `() => import('./pages/x.js')` становится отдельным chunk'ом.