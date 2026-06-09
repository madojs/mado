# Обработка ошибок

В Mado есть три практичных слоя ошибок: загрузка роутов, загрузка данных и
действия пользователя.

## Route errors

Глобальная граница:

```ts
export default routes(manifest, {
  errorPage: (err) => html`
    <main>
      <h1>Что-то пошло не так</h1>
      <pre>${err.message}</pre>
      <a data-link href="/">На главную</a>
    </main>
  `,
});
```

Локальная `page({ errorView })` имеет приоритет над `errorPage`.

## Resource errors

`resource()` дает `error()` и `loading()`. Показывай retry рядом с данными.

```ts
const users = resource(() => "/api/users", jsonFetcher<User[]>());

html`
  ${() => users.error()
    ? html`<p role="alert">${users.error()!.message}</p>
         <button @click=${users.refresh}>Повторить</button>`
    : null}
`;
```

## Forms and mutations

Ошибки валидации — в `useForm()`. Ошибки записи — рядом с submit-кнопкой.

```ts
const form = useForm(
  { email: { required: true, type: "email" } },
  { validateAsync: (values) => api.validateUser(values) },
);
const save = mutation((values) => api.post("/users", values), {
  invalidates: ["/api/users*"],
});
```

## Cleanup

Внешние browser subscriptions чисти через `ctx.onDispose()`. `resource()`,
`effect()` и signals внутри component setup уже привязаны к lifecycle.
