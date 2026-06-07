# Mado для бекендеров

> Ты пишешь на Go / Rust / .NET / Java / Python и тебе нужно запилить веб-морду.  
> Эта страница — mental model Mado за 10 минут, на твоём языке.

---

## Главная аналогия

Mado устроен **как HTTP-сервер**. Серьёзно:

| Серверный мир | Mado |
|---|---|
| HTTP-роутер (chi, axum, mux) | `routes()` — манифест путей |
| Handler `func(req, resp)` | `page({ view: (ctx) => html\`...\` })` |
| Middleware | `layout` в `nested()` (оборачивает handler) |
| Шаблонизатор (Jinja, Handlebars) | `html\`\`` tagged template |
| HTTP-клиент с кешем | `resource()` — fetch + cache + invalidation |
| Reactive variable / atom | `signal()` — реактивный геттер |
| Background goroutine / task | `effect()` — авто-перезапускается при изменении сигнала |
| `defer cleanup()` | `ctx.onDispose(fn)` в setup компонента |
| ENV-переменные | `createContext()` + `provide()`/`inject()` |

Если ты понимаешь HTTP-сервер, ты понимаешь Mado.

---

## Файловая структура — как у обычного приложения

```
src/
├── routes.ts         ← манифест путей (как router.go в chi)
├── main.ts           ← entry point (как main.go: настройка + run)
├── pages/            ← по одному файлу на страницу (как handler.go)
├── components/       ← переиспользуемые UI (как helpers/)
├── layouts/          ← обёртки для групп страниц (как middleware/)
└── lib/              ← бизнес-логика, API-клиент (как service/, repo/)
```

Один файл = одна страница. Никакой file-based magic routing — всё руками в `routes.ts`.

---

## Hello World — серверная аналогия

### Go (chi) — для сравнения

```go
r := chi.NewRouter()
r.Get("/", func(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("<h1>Hello</h1>"))
})
r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    fmt.Fprintf(w, "<h1>User %s</h1>", id)
})
http.ListenAndServe(":8080", r)
```

### Mado — то же самое

```ts
// src/routes.ts
import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user.js"),
});
```

```ts
// src/pages/home.ts
import { page, html } from "@madojs/mado";
export default page({
  view: () => html`<h1>Hello</h1>`,
});
```

```ts
// src/pages/user.ts
import { page, html } from "@madojs/mado";
export default page<{ id: string }>({
  view: ({ params }) => html`<h1>User ${params.id}</h1>`,
});
```

Параметры пути попадают в `params` — так же, как в `chi.URLParam`.

---

## Сигналы — это reactive variable

Если ты писал на Erlang/Elixir с `Agent`, или на Rust с `Arc<Mutex<T>>`, или просто хранил state в struct и обновлял его — `signal` это то же самое, плюс **авто-перерисовка** компонентов, которые этот state читают.

```ts
import { signal, effect } from "@madojs/mado";

// "переменная" с подпиской
const count = signal(0);

// читать
console.log(count()); // 0

// писать
count.set(5);

// "горутина", которая запускается на каждое изменение
effect(() => {
  console.log("count is now", count());
});
// → выведет "count is now 5"

count.set(10);
// → выведет "count is now 10"
```

Никаких правил вида «нельзя в условии». Сигнал — это просто функция-геттер. Где её прочитали — туда и подписались.

---

## `resource()` — HTTP-клиент с кешем (как `cache.GetOrSet`)

Это **самая полезная абстракция для бекендера**. Это как Redis с автоматической инвалидацией, только в браузере.

```ts
import { resource, mutation, jsonFetcher, invalidate } from "@madojs/mado";

// "репозиторий пользователя"
const userId = signal(1);

const user = resource(
  () => `/api/users/${userId()}`,         // ключ кеша (реактивный!)
  jsonFetcher<User>(),                    // как загружать
  { staleTime: 60_000 },                  // 60 секунд кеш
);

// в компоненте:
user.data();     // User | undefined
user.error();    // Error | null
user.loading();  // boolean

// мутация (как POST/PUT)
const save = mutation<User, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },  // glob-инвалидация — как `cache.Drop("users:*")`
);

await save.run(newUser);
// автоматически: user.data() обновится, если совпал glob
```

Если бы такая абстракция была в Go-мире для серверных кешей — мы бы все плакали от счастья.

---

## Компоненты = handler с собственной памятью

Компонент — это **handler**, который рендерит свой кусок UI. У него есть:

- параметры (attributes/properties);
- внутренний state (`signal`'ы);
- lifecycle: `connectedCallback` (как Init), `disconnectedCallback` (как Close).

```ts
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);

  return () => html`
    <button @click=${() => count.update(n => n + 1)}>
      Clicks: ${count}
    </button>
  `;
});
```

Использование:

```ts
html`<x-counter></x-counter>`
```

Регистрируем тег `<x-counter>` в браузере — он становится «функцией», которую можно вставлять в HTML. Это **нативный** механизм браузера (Web Components), Mado только склеивает его с сигналами.

---

## Формы — как `form.Validate()` на бекенде

Mado использует **schema-based validation в духе HTML constraints**, плюс добавляет state-tracking.

```ts
import { useForm } from "@madojs/mado";

const f = useForm({
  email: { required: true, type: "email" },
  age:   { required: true, type: "number", min: 18 },
});

// в шаблоне:
html`
  <form @submit=${f.onSubmit(async (v) => {
    await api.save(v);
    f.reset();
  })}>
    <input name="email" .value=${() => f.values().email ?? ""}
           @input=${f.onInput} @blur=${f.onBlur} />
    
    ${() => f.errors().email && f.touched().email
      ? html`<small>${f.errors().email}</small>`
      : null}
    
    <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
  </form>
`;
```

Кастомная валидация — `validate: (values) => errors | null`. Никаких Yup-схем и зависимостей.

---

## Контекст = DI / dependency injection

Как в Go ты передаёшь `context.Context` через стек вызовов — так в Mado контекст пробрасывается через DOM-дерево.

```ts
import { createContext, provide, inject } from "@madojs/mado";

// объявляем "тип" зависимости
const ApiCtx = createContext<ApiClient>(defaultApiClient);

// в корневом компоненте — предоставляем
component("x-app", ({ host }) => {
  provide(host, ApiCtx, new ApiClient("https://api.example.com"));
  return () => html`<x-page/>`;
});

// в любом дочернем — забираем
component("x-page", ({ host }) => {
  const api = inject(host, ApiCtx);  // signal<ApiClient>
  return () => html`<div>API version: ${() => api().version}</div>`;
});
```

Это как `context.WithValue` / `ctx.Value` в Go, только реактивное.

---

## SEO — не SSR, а `bake` (как `templ generate` в Go)

Если ты привык к серверному рендерингу для SEO, в Mado это решается иначе: **prerender на build**.

```ts
// src/pages/product.ts
export default page({
  bake: {
    paths: () => api.allProductSlugs(),   // build-time fetch
    data: ({ slug }) => api.getProduct(slug),
    revalidate: 3600,
  },
  head: ({ slug }, data) => ({
    description: data.description,
    canonical: `/product/${slug}`,
    og: { title: data.name, image: data.image },
  }),
  view: ({ params }) => html`<x-product data-slug=${params.slug}/>`,
});
```

```bash
npm run bake   # → out/product/iphone-15/index.html (+ sitemap)
```

Краулер видит готовый HTML с meta-тегами. Пользователь видит то же самое + интерактив после загрузки JS.

Подробнее: [`03-static-bake.md`](./03-static-bake.md).

---

## Типичные задачи бекендера — рецепты

### CRUD-страница со списком

```ts
import { page, html, resource, each, signal } from "@madojs/mado";

export default page({
  view: () => {
    const users = resource(() => "/api/users", jsonFetcher<User[]>());
    
    return html`
      ${() => users.loading() ? html`<p>Loading…</p>` : null}
      ${() => users.error() ? html`<p>Error: ${users.error()!.message}</p>` : null}
      <ul>
        ${() => each(users.data() ?? [], u => u.id, u => html`
          <li><a href="/users/${u.id}" data-link>${u.name}</a></li>
        `)}
      </ul>
    `;
  },
});
```

### Форма с POST

```ts
import { useForm, mutation } from "@madojs/mado";

const createUser = mutation<NewUser, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },
);

// в page.view:
const f = useForm({ name: { required: true } });

html`
  <form @submit=${f.onSubmit(async (v) => {
    await createUser.run(v);
    navigate("/users");
  })}>
    <input name="name" @input=${f.onInput}>
    <button>Create</button>
  </form>
`;
```

### Защищённая зона (auth middleware)

```ts
// src/layouts/auth-layout.ts
import { page, html, effect } from "@madojs/mado";
import { isAuthed, navigate } from "../lib/auth.js";

export default page({
  view: ({ child }) => {
    effect(() => {
      if (!isAuthed()) navigate("/login");
    });
    return html`<div class="app-shell">${child}</div>`;
  },
});
```

```ts
// src/routes.ts
import { routes, nested } from "@madojs/mado";

export default routes({
  "/login": () => import("./pages/login.js"),

  "/app/*": nested({
    layout: () => import("./layouts/auth-layout.js"),
    routes: {
      "dashboard": () => import("./pages/dashboard.js"),
      "users": () => import("./pages/users.js"),
    },
  }),
});
```

### Глобальный API-клиент (как singleton в Go)

```ts
// src/lib/api.ts
export class ApiClient {
  constructor(private base: string) {}
  get<T>(path: string): Promise<T> {
    return fetch(this.base + path).then(r => r.json());
  }
}

export const api = new ApiClient("/api");
```

Используется напрямую `import { api } from '...'` либо через `createContext` для тестируемости.

---

## Что **не** нужно учить (хорошие новости)

- **Хуки и правила хуков.** Нет в Mado. Сигналы — обычные функции.
- **VDOM и reconciliation.** Нет. Сигналы обновляют DOM напрямую, точечно.
- **Webpack/Vite-конфиги.** Нет билда. `tsc → браузер`.
- **`useEffect` dependency arrays.** `effect()` сам видит, что ты прочитал.
- **State management библиотеки** (Redux/Zustand). Сигналы + context.
- **CSS-in-JS трансформации.** Shadow DOM + `css\`\`` + cssVars.
- **Routing v6 → v7 migration guide.** `routes()` — 500 строк, читается за 20 минут.

---

## Что **придётся** освоить (честно)

Это новые концепции. Не страшные, но плюс к React/Vue базе:

1. **Custom Elements / Shadow DOM.** `<x-foo>` — это не div, это полноценный элемент с собственным DOM. Слоты, scoped CSS. Один вечер чтения MDN.
2. **`attribute` vs `property`.** Attribute — это строка в HTML (`data-id="5"`), property — JS-свойство (`el.id = 5`). `?attr=${flag}` и `.prop=${value}` в шаблонах — это про разные вещи. Главное правило: **числа/объекты/массивы — через `.prop`, флаги — через `?attr`, строки — через `attr`**.
3. **Сигналы.** Если первый раз — на 10 минут зависнешь, потом проще, чем хуки.
4. **`html\`\``-шаблоны.** Это просто JS-функция с подсветкой через [lit-plugin](./04-ide-setup.md). Не магия.

Всё остальное — стандартный браузер + TypeScript.

---

## Чего не хватает (честно)

- Нет hot reload, только full reload через SSE. Достаточно для большинства, но не как у Vite.
- Нет dev-tools браузерного расширения. Используется `localStorage.madoDebug = '1'` + console.
- Нет StackBlitz-стартеров (пока).
- Нет AI-ассистента, который знает Mado так же хорошо, как React. Будут вопросы — читай `src/`, там не страшно.

---

## Дальше

- **[`01-routing.md`](./01-routing.md)** — детально про роутер.
- **[`02-project-layout.md`](./02-project-layout.md)** — структура проекта.
- **[`03-static-bake.md`](./03-static-bake.md)** — SEO без SSR.
- **[`examples/showcase/`](../../examples/showcase/)** — полный пример (landing + admin).

Если что-то непонятно — open issue, или просто открой исходник. Это правда читается за вечер.
