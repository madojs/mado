# Mado · Pièges LLM

> Erreurs typiques que les assistants IA (Copilot, Claude, ChatGPT, Cursor)
> commettent lors de la génération de code Mado. Et comment les corriger.

Ce document s'adresse à **deux publics** :

1. **Les agents IA dans l'IDE** qui lisent `AGENTS.md` / `.cursorrules` / `.github/copilot-instructions.md`. Plus de détails sur les pièges typiques sont fournis ici.
2. **Les humains** qui ont reçu du code d'une IA avec ces erreurs et ne comprennent pas ce qui ne va pas.

---

## Piège #1 : `${signal()}` au lieu de `${() => signal()}`

**Symptôme :** la valeur dans le template s'affiche mais ne se met pas à jour quand le signal change.

```ts
const count = signal(0);

// ❌ L'IA génère souvent ceci
html`<div>Compte : ${count() * 2}</div>`;
// → Affichera "Compte : 0" et ne se mettra plus jamais à jour.
// count() est lu une seule fois quand le TemplateResult est créé.

// ✅ Correct — fonction getter
html`<div>Compte : ${() => count() * 2}</div>`;
// → Mado créera un effect() pour cette fonction et re-rendra quand count change.

// ✅ Aussi correct — le signal lui-même est une fonction
html`<div>Compte : ${count}</div>`;
```

**Règle :**

- Si `${...}` contient une **expression** (quelque chose est fait avec le signal) — enveloppez dans `() => ...`.
- Si `${...}` contient **le signal lui-même** — il peut être utilisé tel quel.

Ceci s'applique aux **bindings enfants** (texte à l'intérieur des tags) et aux **attributs de valeur** (`@click`, `.prop`, `?attr`, attributs ordinaires).

---

## Piège #2 : `<button disabled=${loading}>` au lieu de `?disabled`

**Symptôme :** le bouton n'est pas désactivé, ou est toujours désactivé.

```ts
const loading = signal(false);

// ❌ C'est setAttribute("disabled", "false") — le DOM traite ça comme disabled
html`<button disabled=${loading()}>Enregistrer</button>`;

// ✅ Correct — binding booléen (basculer l'attribut)
html`<button ?disabled=${loading}>Enregistrer</button>`;
```

**Règles pour les attributs :**
| Préfixe | Ce qu'il fait | Quand utiliser |
|---|---|---|
| `attr=` | `setAttribute("attr", value)` | strings, nombres, URLs |
| `.attr=` | `el.attr = value` (propriété DOM) | objets, tableaux, `.value` d'input |
| `?attr=` | basculer l'attribut (par vérité) | `disabled`, `hidden`, `checked`, etc. |
| `@evt=` | `addEventListener("evt", fn)` | gestionnaires d'événements |

---

## Piège #3 : style useState / useEffect

**Symptôme :** l'IA génère du code de style React qui ne fonctionne pas dans Mado.

```ts
// ❌ L'IA écrit souvent ceci
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => { console.log(count); }, [count]);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// ✅ Correct dans Mado
import { component, signal, effect, html } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  effect(() => console.log(count()));  // auto-abonnement, disposé automatiquement
  return () => html`
    <button @click=${() => count.update(c => c + 1)}>${count}</button>
  `;
});
```

**Différences clés :**

- Pas de hooks, pas de règles de hooks.
- `signal()` peut être créé n'importe où — dans le setup, dans un effect, dans un handler.
- `effect()` voit ce qu'il a lu de lui-même — pas besoin de tableau de dépendances.
- Un composant est `component("x-name", setup)`, pas une fonction JSX.

---

## Piège #4 : `useEffect(() => { ... return cleanup })`

**Symptôme :** l'IA écrit `return cleanup` à l'intérieur d'un effect, attendant que ça fonctionne comme dans React.

```ts
// ❌ L'IA essaie d'écrire ceci
component("x-timer", () => {
  effect(() => {
    const id = setInterval(..., 1000);
    return () => clearInterval(id);  // NE fonctionnera PAS, utilisez ctx.onDispose à la place
  });
  return () => html`...`;
});

// ✅ Correct : nettoyage via ctx.onDispose
component("x-timer", (ctx) => {
  const id = setInterval(..., 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`...`;
});
```

**Note :** `effect()` supporte bien `return cleanup`, mais c'est un **nettoyage par exécution** (s'exécute avant la prochaine exécution de l'effect), pas un nettoyage au démontage. Pour le nettoyage au démontage, utilisez `ctx.onDispose`.

---

## Piège #5 : Composant comme classe ou avec un décorateur

**Symptôme :** l'IA génère une classe de style Lit ou vanilla WebComponent.

```ts
// ❌ IA : "faisons comme Lit"
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement('x-counter')
class XCounter extends LitElement { ... }

// ❌ IA : "faisons en style vanilla"
class XCounter extends HTMLElement {
  connectedCallback() { ... }
}
customElements.define("x-counter", XCounter);

// ✅ Correct : component() fonctionnel
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);
  return () => html`<button @click=${() => count.update(n => n + 1)}>${count}</button>`;
});
```

---

## Piège #6 : imports sans l'extension `.js`

**Symptôme :** TypeScript compile, mais le navigateur obtient une 404.

```ts
// ❌ L'IA omet souvent l'extension
import { foo } from "./bar";
import { Home } from "./pages/home";

// ✅ Correct : les modules ES dans le navigateur nécessitent l'extension
import { foo } from "./bar.js";
import { Home } from "./pages/home.js";
```

**Pourquoi `.js` et pas `.ts` :** le navigateur reçoit du JS déjà compilé. TypeScript est assez intelligent pour comprendre `./bar.js` comme une référence à `./bar.ts` à la compilation.

---

## Piège #7 : listes via `.map()` sans clés

**Symptôme :** lors du réordonnancement des éléments, le focus d'input est perdu / les animations CSS se cassent / les performances souffrent sur les grandes listes.

```ts
// ❌ Fonctionne, mais sans clé : recrée le DOM à chaque changement
html`<ul>
  ${() => items().map((t) => html`<li>${t.name}</li>`)}
</ul>`;

// ✅ Correct : each() avec une fonction de clé
import { each } from "@madojs/mado";
html`<ul>
  ${() =>
    each(
      items(),
      (t) => t.id,
      (t) => html`<li>${t.name}</li>`,
    )}
</ul>`;
```

**Règle :** utilisez toujours `each()` pour les listes de tableaux avec des IDs stables. Réservez `.map()` uniquement pour les listes statiques.

---

## Piège #8 : `signal.value` ou `count.get()`

**Symptôme :** l'IA écrit une API de style Vue ou Solid pre-v1.

```ts
const count = signal(0);

// ❌ Pas une telle API
count.value;
count.value = 5;
count.get();

// ✅ Correct
count(); // lecture
count.set(5); // écriture
count.update((n) => n + 1);
count.peek(); // lecture sans abonnement
```

---

## Piège #9 : `provide(ApiCtx, value)` sans host

**Symptôme :** TypeError lors de la tentative de fournir le context.

```ts
// ❌ L'IA oublie host
provide(ApiCtx, myApi);
inject(ApiCtx);

// ✅ Correct : le premier argument est host (le composant courant)
component("x-app", ({ host }) => {
  provide(host, ApiCtx, myApi);
  return () => html`...`;
});

component("x-child", ({ host }) => {
  const api = inject(host, ApiCtx); // signal<valeur>
  return () => html`...`;
});
```

---

## Piège #10 : attendre du SSR

**Symptôme :** l'IA écrit du code en supposant que la page est pré-rendue côté serveur.

```ts
// ❌ Ceci ne fonctionne que dans le navigateur
const userId = location.pathname.split("/")[2];

// ❌ Ceci aussi ne fonctionne que dans le navigateur
if (typeof window !== "undefined") { ... }  // dans Mado, window est TOUJOURS disponible
```

Mado **ne fait pas de SSR avec hydratation**. Le code ne s'exécute pas sur le serveur — il y a uniquement `bake` (prérendu statique au moment du build) et edge-prerender. Les deux remplacent le code utilisateur par un environnement linkedom, mais c'est **uniquement** pour générer du HTML avec des meta tags, pas pour exécuter la logique de page.

Cela signifie :

- ✅ `window`, `document`, `location`, `fetch` — disponibles sans vérifications.
- ❌ N'écrivez pas de code qui essaie de "fonctionner universellement sur serveur et client".
- ❌ N'utilisez pas les patterns Next.js (`getServerSideProps`, `headers()`).

---

## Piège #11 : `useForm()` avec un résolveur zod/yup

**Symptôme :** l'IA veut brancher un validateur.

```ts
// ❌ Pas une telle API
const f = useForm({ resolver: zodResolver(schema) });

// ✅ Correct : validation proche du HTML via le schéma useForm
const f = useForm({
  email: { required: true, type: "email" },
  age: { required: true, type: "number", min: 18 },
});

// ✅ Ou une fonction personnalisée si HTML5 ne suffit pas
const f = useForm(
  { name: { required: true } },
  {
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.name && /\d/.test(values.name as string)) {
        errors.name = "Le nom ne doit pas contenir de chiffres";
      }
      return Object.keys(errors).length ? errors : null;
    },
  },
);
```

---

## Piège #12 : Tailwind / styled-components / CSS Modules

**Symptôme :** l'IA suggère des solutions CSS React standard.

Mado utilise **Shadow DOM + `css\`\`` + variables CSS**. Les frameworks UI globaux (Tailwind,
Bootstrap-via-classes) **ne fonctionnent qu'en light DOM** (`shadow: false`) :

```ts
// Composant page/écran Light-DOM, les classes Tailwind fonctionnent
component(
  "x-admin-page",
  () => () => html`
    <section class="bg-white shadow-lg rounded-lg p-4">...</section>
  `,
  { shadow: false },
);

// Composant Shadow-DOM (par défaut) — Tailwind ne fonctionne PAS.
// Utilisez css`` ou ::part() pour le stylage externe.
component("x-button", () => () => html`<button><slot></slot></button>`, {
  styles: css`
    button {
      background: var(--button-bg, #2563eb);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
    }
  `,
});
```

**Thèmes et personnalisation — via des variables CSS**, pas des classes.

---

## Piège #13 : `import * as Mado from "@madojs/mado"`

**Symptôme :** l'IA veut un import de namespace.

Cela fonctionne, mais duplique les noms et se tree-shake mal. Les imports nommés sont préférés :

```ts
// ✅ Canonique
import { signal, html, component, css, page } from "@madojs/mado";

// ⚠️ Fonctionne, mais excessif
import * as Mado from "@madojs/mado";
Mado.signal(0);
```

---

## Piège #14 : tentative d'ajouter une dépendance runtime

**Symptôme :** l'IA suggère `npm install lodash` / `npm install date-fns` / etc.

Mado est **zéro dépendances runtime** par conception. Si l'IA veut ajouter :

- **lodash** → utilisez du JS natif (`Object.entries`, `Array.prototype`, `structuredClone`) ;
- **date-fns** → utilisez `Intl.DateTimeFormat` et `Intl.RelativeTimeFormat` ;
- **uuid** → `crypto.randomUUID()` ;
- **axios** → `fetch` natif + `jsonFetcher()` de Mado ;
- **classnames** → template literal natif ou une map d'objet.

Toute dépendance runtime est une **violation des principes du framework**. Si vous ne pouvez vraiment pas l'éviter — ajoutez-la au projet utilisateur, pas au cœur de Mado.

---

## Piège #15 : `<style>` inline dans les templates de page

**Symptôme :** l'IA met un grand `<style>` directement dans une page `html\`\``.

```ts
// ❌ Fonctionne, mais se met à l'échelle difficilement et complique le nettoyage
page({
  view: () => html`
    <style>
      .panel {
        padding: 1rem;
      }
    </style>
    <section class="panel">...</section>
  `,
});

// ✅ Correct : styles de composant via css``
component(
  "x-admin-panel",
  () => () => html` <section class="panel">...</section> `,
  {
    styles: css`
      .panel {
        padding: 1rem;
      }
    `,
  },
);
```

Pour les écrans route/page d'admin backend, il est souvent approprié d'utiliser `shadow: false`,
afin que les utilitaires globaux de layout/form/table fonctionnent comme un panneau d'admin
ordinaire. Mais si le layout utilise `<slot>` pour projeter la page dans le shell, gardez le
layout en Shadow DOM et gardez les styles du shell dans `styles: css\`\``.

---

## Piège #16 : liens Shadow DOM sans `data-link`

**Symptôme :** un lien à l'intérieur d'un Web Component provoque un rechargement complet de
la page ou n'est pas préchargé.

```ts
// ❌ Lien ordinaire : le navigateur effectuera un rechargement complet
html`<a href="/tickets/42">Ouvrir</a>`;

// ✅ Navigation SPA : router() interceptera le clic même à travers Shadow DOM
html`<a href="/tickets/42" data-link>Ouvrir</a>`;
```

Mado trouve le lien via `event.composedPath()`, donc `data-link` fonctionne aussi à l'intérieur
de Shadow DOM. Le hover-prefetch utilise le même chemin ; `data-no-prefetch` désactive le
prefetch pour un lien spécifique.

---

## Piège #17 : `resource()` en dehors du setup du composant

**Symptôme :** l'IA crée une resource dans le scope du module pour "réutiliser" des données
entre les pages.

```ts
// ❌ Pas de nettoyage du lifecycle, générera un avertissement dev
const tickets = resource(
  () => "tickets",
  () => api.listTickets(),
);

component("x-tickets", () => {
  return () => html`${() => tickets.data()?.length ?? 0}`;
});

// ✅ Créer la resource à l'intérieur du setup du composant
component("x-tickets", () => {
  const tickets = resource(
    () => "tickets",
    () => api.listTickets(),
  );
  return () => html`${() => tickets.data()?.length ?? 0}`;
});
```

Ainsi, les abonnements d'invalidation, les abort controllers et les effects seront
nettoyés quand le composant se déconnecte.

---

## Piège #18 : supposer que les templates imbriqués ne nécessitent pas de nettoyage

**Symptôme :** l'IA assemble un outlet de route ou une UI conditionnelle à partir de
`TemplateResult`s imbriqués, et les anciens éléments continuent de vivre sous la nouvelle page.

```ts
const view = signal(html`<x-home></x-home>`);

// ✅ Pattern normal : un TemplateResult imbriqué peut être retourné depuis un binding enfant
html`${view}`;
```

À partir de v0.3, ceci est garanti par des tests de régression : quand un binding enfant est
remplacé, Mado dispose récursivement les instances/effects de template imbriqués. Si vous
voyez des pages s'accumuler dans `#app`, c'est un bug core, pas quelque chose que vous devez
nettoyer manuellement.

---

## Piège #19 : utilitaires CSS globaux dans Shadow DOM

**Symptôme :** la page a l'air "sans style" : `.page-head`, `.btn`, `.form-grid`,
`.metric-grid` ne sont pas appliqués.

```ts
// ❌ .page-head est déclaré globalement, mais x-dashboard utilise Shadow DOM par défaut
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
);

// ✅ Les composants page/layout/admin-shell doivent souvent être Light DOM
component(
  "x-dashboard",
  () => () => html`
    <header class="page-head">...</header>
    <div class="metric-grid">...</div>
  `,
  { shadow: false },
);
```

Règle : Shadow DOM — pour les widgets feuilles et les layouts basés sur slot, Light DOM — pour
les composants route/page/admin-screen qui utilisent intentionnellement des utilitaires partagés
de layout/form/table. Rappel : `<slot>` ne projette les enfants qu'en Shadow DOM ; avec
`shadow: false` c'est un élément ordinaire.
Plus de détails : [`09-shadow-vs-light-dom.md`](./09-shadow-vs-light-dom.md).

---

## Piège #20 : `host.getAttribute()` dans render = pas réactif

**Symptôme :** l'apparence du composant ne se met pas à jour quand le parent change un attribut.

```ts
// ❌ host.getAttribute() dans la fonction render est lu une seule fois.
// Le render ne se relance que quand ses propres signaux changent.
component("x-badge", ({ host }) => () => {
  const variant = host.getAttribute("variant") ?? "default";
  return html`<span class=${variant}>...</span>`;
});

// ✅ Correct : ctx.attr() — retourne un Signal<string> réactif
component("x-badge", ({ attr }) => {
  const variant = attr("variant", "default");
  return () => html`<span class=${() => `badge-${variant()}`}>...</span>`;
});
```

**Règle :** n'utilisez jamais `host.getAttribute()` ou `host.hasAttribute()` dans la
fonction render pour des valeurs qui peuvent changer de l'extérieur. Utilisez `ctx.attr()` —
il retourne un Signal qui se met à jour via `attributeChangedCallback`.

---

## Piège #21 : `<button>` Shadow DOM ne soumet pas les formulaires

**Symptôme :** cliquer sur `<x-button type="submit">` dans un `<form>` ne fait rien.

Un `<button>` dans le Shadow DOM ne participe pas à l'algorithme form-owner pour
`<form>` dans le Light DOM — c'est une limitation de la spécification.

```ts
// ❌ Le <button type="submit"> interne ne peut pas déclencher le <form> parent
component("x-button", ({ host }) => {
  return () => html`<button type="submit"><slot></slot></button>`;
});

// ✅ Pont via requestSubmit()
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

Plus de détails : [`17-shadow-dom-forms.md`](./17-shadow-dom-forms.md).

---

## Piège #22 : `useForm()` avec des inputs Shadow DOM personnalisés

**Symptôme :** `form.onInput` reçoit `undefined` pour name/value de `<x-input>`.

Quand un input Shadow DOM dispatche un événement `input`, le navigateur retarget
`e.target` du `<input>` interne vers le host `<x-input>`. Mais `<x-input>`
(HTMLElement) n'a pas `.name` ni `.value` — donc `useForm` ne reçoit rien.

```ts
// ❌ Pas de propriétés proxy — useForm ignore silencieusement les événements
component("x-input", ({ host, attr }) => {
  const name = attr("name", "");
  return () => html`<input name=${name} />`;
});

// ✅ Ajouter des propriétés proxy pour la compatibilité useForm
component("x-input", ({ host, attr }) => {
  const name = attr("name", "");

  Object.defineProperty(host, "name", {
    get: () => host.getAttribute("name") ?? "",
    configurable: true,
  });
  Object.defineProperty(host, "value", {
    get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
    configurable: true,
  });

  return () => html`<input name=${name} />`;
});
```

Plus de détails : [`17-shadow-dom-forms.md`](./17-shadow-dom-forms.md).

---

## Aide-mémoire pour l'IA

| Si vous voulez faire…                 | Correct dans Mado                           |
| ------------------------------------- | ------------------------------------------- |
| `useState(0)`                         | `signal(0)`                                 |
| `useEffect(() => {...}, [a, b])`      | `effect(() => {...})` (auto-dépendances)    |
| `useEffect(() => return cleanup, [])` | `ctx.onDispose(cleanup)`                    |
| `useMemo(() => x, [a])`               | `computed(() => x)`                         |
| `useCallback(fn, [])`                 | fonction ordinaire                          |
| `useContext(Ctx)`                     | `inject(host, Ctx)`                         |
| `useQuery(['key'], fn)`               | `resource(() => 'key', fn)`                 |
| `useMutation(fn)`                     | `mutation(fn, { invalidates: [...] })`      |
| `useRouter().push('/')`               | `navigate('/')`                             |
| `useRouter().query.q`                 | `queryParam('q')`                           |
| `<input value={v} onChange={...}>`    | `<input .value=${v} @input=${...}>`         |
| `{items.map(x => ...)}`               | `${() => each(items, x => x.id, x => ...)}` |
| `useForm({ resolver: zodResolver })`  | `useForm({...}, { validate: (v) => ... })`  |
| `class extends HTMLElement`           | `component('x-name', setup)`                |
| `@customElement('x')`                 | `component('x-name', setup)`                |
| `host.getAttribute('x')` dans render  | `ctx.attr('x', default)` (réactif)          |
| `jsonFetcher()` avec auth             | `apiFetcher()` (attache le Bearer token)    |

Si quelque chose ne rentre pas dans cette liste — ouvrez `src/` et **lisez 500 lignes**. Sérieusement. Mado est intentionnellement petit pour être lisible.
