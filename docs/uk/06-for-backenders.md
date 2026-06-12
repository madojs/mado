# Mado для бекендерів

Якщо ти пишеш Go, Rust, .NET, Java, Python або Node backend, Mado можна уявляти
як маленький HTTP-сервер у браузері.

| Backend mental model | Mado |
|---|---|
| router | `routes()` |
| handler | `page().view` |
| middleware/layout | `nested()` + layout |
| cache get-or-set | `resource()` |
| POST/PUT/DELETE | `mutation()` |
| cache invalidation | `invalidates` / `invalidate()` |
| dependency injection | `createContext/provide/inject` |

## CRUD

```ts
const users = resource(
  () => "/api/users",
  jsonFetcher<User[]>(),
);

const save = mutation(api.saveUser, {
  invalidates: ["/api/users*"],
});
```

Ключі `resource()` — це identity кешу. Додавайте endpoint, query params і форму
даних у ключ: два живі `resource()` з однаковим ключем ділять cache та
in-flight request. Якщо той самий ключ використано з іншим fetcher, Mado
попереджає, бо зазвичай це означає, що ключ кешу занадто широкий.

## Форми

```ts
const form = useForm({
  email: { required: true, type: "email" },
});
```

Mado використовує schema-based validation, близьку до HTML constraints, а не
окрему validation ecosystem.

## Auth

Auth зазвичай живе в `lib/auth.ts` як signal/context. Protected area зручно
робити через nested layout, який перевіряє session і показує dashboard або
redirect/login.

## Правило

Не тягни backend-архітектуру в frontend дослівно. Тримай UI state локальним,
data fetching через `resource()`, mutation через `mutation()`, а shared services
через context.
