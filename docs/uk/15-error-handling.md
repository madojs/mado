# Обробка помилок

Обробляй помилки там, де користувач може відновитися: маршрути, дані, дії
користувача.

```ts
export default routes(manifest, {
  errorPage: (err) => html`
    <main>
      <h1>Щось пішло не так</h1>
      <pre>${err.message}</pre>
      <a data-link href="/">На головну</a>
    </main>
  `,
});
```

`page({ errorView })` має пріоритет над глобальною boundary.

```ts
const users = resource(() => "/api/users", jsonFetcher<User[]>());

html`
  ${() => users.error()
    ? html`<p role="alert">${users.error()!.message}</p>
         <button @click=${users.refresh}>Повторити</button>`
    : null}
`;
```

Валідація належить `useForm()`, помилки запису — поруч із submit-кнопкою.
Зовнішні browser subscriptions очищай через `ctx.onDispose()`.
