# Shadow DOM vs Light DOM

Mado використовує Shadow DOM за замовчуванням, але це не означає, що його треба
вмикати всюди.

## Shadow DOM добре підходить для

- leaf-компонентів;
- isolated widgets;
- badges, cards, modals, buttons;
- компонентів, які мають не ламатися від зовнішнього CSS.

```ts
component("x-badge", () => () => html`<span><slot></slot></span>`, {
  styles: css`:host { display: inline-block; }`,
});
```

## Light DOM краще для

- app shell;
- admin layouts;
- route-level pages;
- компонентів, які мають користуватися глобальними utility classes;
- великих CRUD surfaces, де CSS має бути простим і передбачуваним.

```ts
component("x-app-layout", () => () => html`<main><slot></slot></main>`, {
  shadow: false,
  styles: css`x-app-layout main { display: grid; }`,
});
```

## Практичне правило

Якщо компонент — самостійний reusable visual, бери Shadow DOM. Якщо це частина
app layout або page composition, часто краще Light DOM.

Посилання з `data-link` працюють і в Shadow DOM, бо router використовує
`event.composedPath()`.
