# Shadow DOM + formulaires

L'utilisation de `useForm()` avec des composants input personnalisés en Shadow DOM
nécessite de connaître deux comportements au niveau du navigateur :

1. **Retargeting des événements** — les événements qui remontent du Shadow DOM ont
   leur `e.target` redirigé vers l'élément host. `useForm().onInput` lit
   `e.target.name` et `e.target.value`, mais un élément host `<x-input>`
   ne possède pas nativement ces propriétés.

2. **Association de formulaire** — un `<button type="submit">` à l'intérieur d'un
   Shadow Root ne fait PAS partie de l'algorithme form-owner pour `<form>` dans
   le Light DOM. Cliquer dessus ne déclenche pas le submit du formulaire.

Ces deux limitations sont au niveau de la spécification, pas des bugs Mado. Mais
le framework fournit des patterns qui les rendent indolores.

## Pattern : Propriétés proxy sur les composants input

En encapsulant un `<input>` dans un composant Shadow DOM, exposez `name` et
`value` comme propriétés DOM sur le host pour que `useForm().onInput` fonctionne
après le retargeting :

```ts
import { component, css, html } from "@madojs/mado";

component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  const type = attr("type", "text");
  const value = attr("value", "");

  // Propriétés proxy pour la compatibilité useForm().
  // Après le retargeting Shadow DOM de e.target : <input> → <x-input>,
  // useForm lit e.target.name / e.target.value — ces getters font le pont.
  Object.defineProperty(host, "name", {
    get: () => host.getAttribute("name") ?? "",
    configurable: true,
  });
  Object.defineProperty(host, "value", {
    get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
    set: (v: string) => {
      const input = host.shadowRoot?.querySelector("input");
      if (input) input.value = v;
    },
    configurable: true,
  });

  return () => html`<input name=${name} type=${type} .value=${value} />`;
});
```

L'événement `input` du `<input>` interne a `composed: true` par défaut, donc
il remonte à travers la frontière shadow. Après le retargeting, `e.target` est
`<x-input>`, mais maintenant il a les getters `.name` et `.value` → `useForm`
fonctionne.

## Pattern : Submit de formulaire depuis des boutons Shadow DOM

Un `<button type="submit">` dans le Shadow DOM ne peut pas déclencher le submit
d'un `<form>` dans le Light DOM. Pont via `requestSubmit()` :

```ts
import { component, css, html } from "@madojs/mado";

component("x-button", ({ host, attr }) => {
  const disabled = attr("disabled");

  const handleClick = () => {
    const typeAttr = host.getAttribute("type");
    if (typeAttr === "button" || typeAttr === "reset") return;
    const form = host.closest("form");
    if (form && !host.hasAttribute("disabled")) form.requestSubmit();
  };

  return () => html`
    <button ?disabled=${() => disabled() !== ""} @click=${handleClick}>
      <slot></slot>
    </button>
  `;
});
```

`host.closest("form")` fonctionne parce que l'élément host lui-même vit dans
le Light DOM (seuls ses éléments internes sont dans l'ombre). `requestSubmit()`
déclenche la validation et l'événement `submit` exactement comme si l'utilisateur
avait cliqué sur un bouton submit natif à l'intérieur du formulaire.

## Pattern : Attributs réactifs avec ctx.attr()

Depuis la v0.7, `ctx.attr(name, defaultValue?)` retourne un `Signal<string>` qui
se met à jour automatiquement quand l'attribut change sur le host. Plus besoin de
`MutationObserver` :

```ts
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default"); // Signal<string>

  return () =>
    html`<span class=${() => `badge badge-${variant()}`}>
      <slot></slot>
    </span>`;
});
```

Le parent peut utiliser `?disabled=${() => !form.isValid()}` (attribut booléen)
ou `.variant=${"danger"}` — le composant se re-rend de manière réactive dans
les deux cas.

## Exemple complet de formulaire

```ts
import { page, html, useForm, navigate } from "@madojs/mado";
import "../components/x-input.js";
import "../components/x-button.js";

export default page({
  title: "Connexion",
  view: () => {
    const form = useForm({
      email: { required: true, type: "email" },
      password: { required: true, minLength: 6 },
    });

    const handleLogin = async (values) => {
      await api("/auth/login", { method: "POST", json: values });
      navigate("/admin");
    };

    return html`
      <form @submit=${form.onSubmit(handleLogin)}>
        <x-input
          name="email"
          type="email"
          label="Email"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>
        ${() =>
          form.errors().email
            ? html`<small class="err">${form.errors().email}</small>`
            : null}

        <x-input
          name="password"
          type="password"
          label="Mot de passe"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>

        <x-button type="submit" ?disabled=${() => !form.isValid()}>
          Se connecter
        </x-button>
      </form>
    `;
  },
});
```

## Quand utiliser Light DOM à la place

Si votre composant input est juste un wrapper stylisé sans besoin
d'encapsulation, `shadow: false` évite les deux problèmes (retargeting et
association de formulaire) :

```ts
component(
  "x-field",
  ({ attr }) => {
    const label = attr("label", "");
    return () => html`
      <label>
        <span>${label}</span>
        <slot></slot>
      </label>
    `;
  },
  { shadow: false },
);
```

Avec Light DOM, le `<input>` natif fait partie de l'arbre du document, les
événements ne sont pas retargetés, et le submit fonctionne nativement.
Le compromis : les styles ne sont pas encapsulés (vous devez les scoper
vous-même).

## Résumé

| Problème                       | Solution Shadow DOM                          | Alternative Light DOM           |
| ------------------------------ | -------------------------------------------- | ------------------------------- |
| `useForm` + input personnalisé | Proxy `name`/`value` sur le host             | `<input>` natif dans un slot    |
| Submit de formulaire           | `form.requestSubmit()` dans le click handler | Le bouton natif fonctionne      |
| Attributs réactifs             | `ctx.attr()` → signal auto                   | `ctx.attr()` fonctionne partout |
| Encapsulation des styles       | Oui (automatique)                            | `@scope` manuel ou BEM          |
