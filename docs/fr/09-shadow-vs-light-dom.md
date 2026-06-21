# Shadow DOM vs Light DOM

Les composants Mado utilisent Shadow DOM par défaut. C'est un bon défaut pour
les widgets autonomes, mais les zones d'application et les pages restent
généralement de simples templates light DOM.

## Règle

Utilisez les route layouts pour les zones d'application :

```ts
export default page({
  view: ({ child }) => html`<main class="app-main">${child}</main>`,
});
```

Ces fichiers vivent dans `src/layouts/` et sont composés depuis
`src/app.routes.ts` avec `layout()`. Ils sont stylés par
`src/shared/styles/shell.css`.

Utilisez les page files pour les écrans :

```ts
export default page({
  view: () => html`<section><h1>Users</h1></section>`,
});
```

Les tables, forms, prose et états simples de page sont stylés par
`src/shared/styles/content.css`.

Utilisez Shadow DOM components pour les widgets feuilles :

- buttons, badges, cards, metrics ;
- spinners, modals, toasts ;
- widgets qui doivent posséder leur CSS.

```ts
component("x-status-badge", ({ attr }) => {
  const status = attr("status", "draft");
  return () => html`<span>${status}</span>`;
}, {
  styles: css`
    :host { display: inline-block; }
    span { color: var(--color-text-muted); }
  `,
});
```

## Comment les styles se comportent

- `tokens.css` définit des CSS custom properties ; `var(...)` traverse Shadow
  DOM.
- `reset.css`, `shell.css`, `content.css` s'appliquent seulement au document /
  light DOM.
- Les sélecteurs de classe comme `.data`, `.app-main`, `.error` ne traversent
  pas Shadow DOM.
- Les styles locaux des composants vivent dans ``css`...` `` dans les options de
  `component()`.
- Si un Shadow component accepte des enfants, utilisez `<slot>` et stylisez le
  frame dans les styles du composant.

Si une page semble sans style, vous avez probablement utilisé des classes
globales dans un Shadow DOM component. Déplacez le markup dans une page/layout
ou déplacez le CSS dans les styles du composant.
