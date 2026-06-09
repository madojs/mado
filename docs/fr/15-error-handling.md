# Gestion des erreurs

Traite les erreurs au niveau où l'utilisateur peut récupérer : routes, données,
actions utilisateur.

## Routes

```ts
export default routes(manifest, {
  errorPage: (err) => html`
    <main>
      <h1>Une erreur est survenue</h1>
      <pre>${err.message}</pre>
      <a data-link href="/">Accueil</a>
    </main>
  `,
});
```

`page({ errorView })` a priorité sur cette boundary globale.

## Données

```ts
const users = resource(() => "/api/users", jsonFetcher<User[]>());

html`
  ${() => users.error()
    ? html`<p role="alert">${users.error()!.message}</p>
         <button @click=${users.refresh}>Réessayer</button>`
    : null}
`;
```

## Formulaires et mutations

La validation va dans `useForm()`. Les erreurs serveur d'écriture restent près
du bouton de soumission.

```ts
const form = useForm(
  { email: { required: true, type: "email" } },
  { validateAsync: (values) => api.validateUser(values) },
);
const save = mutation((values) => api.post("/users", values), {
  invalidates: ["/api/users*"],
});
```

Nettoie les subscriptions navigateur externes avec `ctx.onDispose()`.
