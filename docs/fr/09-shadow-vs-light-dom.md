# Shadow DOM vs Light DOM

Les composants Mado utilisent Shadow DOM par défaut. C'est un bon défaut pour les widgets
autonomes, mais ce n'est pas le bon défaut pour chaque composant dans une application.

## Règle générale

Dans Mado, un layout est aussi un composant. Si un fichier décrit une partie
visible et réutilisable de l'arbre UI — app shell, sidebar, modal, table,
section de page — préférez un Web Component déclaré avec `component()`.

Gardez les fonctions simples pour de petits helpers inline :

```ts
const money = (value: number) => html`<span>${formatMoney(value)}</span>`;
```

Ne faites pas d'app shell sous forme de fonction dans les exemples publics. Cela
fonctionne, mais cela cache le modèle du navigateur au lieu de l'enseigner.

Utilisez **Shadow DOM** pour les widgets feuilles :

- boutons, badges, cartes, métriques ;
- modals, toasts, petits composants visuels ;
- widgets d'intégration qui ne devraient pas hériter du CSS de l'app accidentellement ;
- composants dont le stylage doit appartenir au composant lui-même.

Utilisez **Light DOM** (`{ shadow: false }`) pour la structure de l'app qui veut partager
les utilitaires CSS globaux :

- composants route/page ;
- écrans admin avec des layouts denses de tableau/formulaire ;
- écrans riches en données avec des tableaux et des formulaires ;
- composants qui partagent intentionnellement les utilitaires globaux de layout, formulaire et
  tableau ;
- endroits où les enfants doivent simplement rester dans le DOM normal du document.

Utilisez **Shadow DOM** pour les layouts basés sur des slots :

- app shells qui rendent `<slot>` ;
- wrappers sidebar/contenu ;
- frames de layout réutilisables qui possèdent leur propre CSS grid/header/sidebar.

`<slot>` est une fonctionnalité Shadow DOM. Dans un composant `shadow: false`,
`<slot>` est juste un élément DOM normal et ne déplace pas les enfants à cet
endroit du layout.

## Le piège

Le CSS global ne franchit pas une frontière Shadow DOM.

```ts
// global.ts
export const globalStyles = css`
  .page-head { display: flex; justify-content: space-between; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
`;

// ❌ .page-head et .metric-grid ne s'appliqueront pas à l'intérieur du shadowRoot de x-dashboard
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`);
```

Corrigez en rendant le composant route/page Light DOM :

```ts
component("x-dashboard", () => () => html`
  <header class="page-head">...</header>
  <div class="metric-grid">...</div>
`, {
  shadow: false,
  styles: css`
    x-dashboard { display: block; }
    x-dashboard .panel { padding: 1rem; }
  `,
});
```

Maintenant les utilitaires globaux et les styles locaux scopés fonctionnent tous les deux.

## Comment les styles se comportent

- `styles: css\`\`` en Shadow DOM est adopté dans le shadowRoot du composant.
- `styles: css\`\`` avec `shadow: false` est scopé au nom du tag et adopté globalement.
- Les propriétés CSS personnalisées (`--accent`, `--bg`, etc.) traversent les frontières Shadow DOM.
- Les sélecteurs de classe comme `.btn`, `.form-grid`, `.page-head` ne traversent **pas** les
  frontières Shadow DOM.
- Les enfants slottés conservent leurs propres styles de document ; le composant shadow ne peut
  les cibler qu'à travers `::slotted(...)`.
- `<slot>` projette les enfants uniquement en Shadow DOM. Dans un composant `shadow: false`,
  c'est juste un élément `<slot>` normal et ne déplacera pas les enfants à cet endroit dans
  votre layout.

## Forme recommandée de l'application

```ts
// racine et pages : Light DOM
component("x-app", setup, { shadow: false });
component("x-users-page", setup, { shadow: false });

// layout basé sur slot : Shadow DOM par défaut, car il possède la grille du shell
component("x-app-layout", setup);

// widgets feuilles : Shadow DOM par défaut
component("x-status-badge", setup);
component("x-stat-card", setup);
component("x-toast-stack", setup);
```

Cela donne aux écrans d'admin backend un CSS prévisible tout en préservant l'encapsulation
pour les widgets réutilisables et les shells basés sur slot.

Le modèle d'import est volontairement natif au navigateur :

```ts
import "./components/app-layout.js";

render(html`<x-app-layout>${router.view}</x-app-layout>`, app);
```

L'import enregistre le custom element avec `customElements.define()`. Le template
crée un élément `<x-app-layout>`. Le navigateur relie les deux. Il n'y a pas de
valeur de composant à la React que l'on passe comme fonction.

Si un layout n'a pas besoin de projection slot et doit être entièrement stylé par du CSS
global, `shadow: false` peut rester un bon choix. S'il contient `<slot>`, gardez Shadow DOM
et mettez les styles du shell dans `styles: css\`\``.

## Routage et liens

`data-link` fonctionne à l'intérieur de Shadow DOM. Le router utilise `event.composedPath()`,
donc l'interception de clic et le hover-prefetch peuvent voir les liens depuis les shadow roots
ouverts.

```ts
component("x-card-link", () => () => html`
  <a href="/app/accounts" data-link>Comptes</a>
`);
```

Le lien peut être en Shadow DOM ; la navigation reste SPA.

## Où importer les composants

Les custom elements sont globaux après leur enregistrement, mais cet
enregistrement reste un import JavaScript explicite.

```ts
// main.ts : frame global de l'app
import "./components/app-shell.js";

// pages/tickets.ts : composant possédé par cette page
import "../components/ticket-list.js";
```

Le navigateur ne télécharge **pas** `ticket-list.js` simplement parce qu'il voit
`<ticket-list>`. Le fichier doit d'abord être importé quelque part. Une fois
importé, il appelle `customElements.define(...)`, et le tag devient connu dans
le document courant.

N'importez pas tous les composants en masse dans `main.ts` "au cas où". Cela
fonctionne pour de petites démos, mais cache l'ownership et casse le chargement
paresseux des routes. Préférez :

- app shell/providers globaux dans `main.ts` ;
- composants utilisés par une seule page dans ce fichier page ;
- composants partagés d'une feature dans la page d'entrée de cette feature ;
- petits leaf components vraiment globaux dans `main.ts` seulement s'ils sont
  utilisés partout.

## Leçon du Showcase

`examples/showcase` utilise cette séparation délibérément :

- `x-app` et les pages de route CRM sont Light DOM ;
- `x-app-layout` garde Shadow DOM car il possède un shell sidebar/contenu basé sur slot ;
- les utilitaires de tableau/formulaire/page vivent dans `styles/global.ts` ;
- les composants feuilles comme `x-stat-card`, `x-status-badge`, `x-modal` et `x-toast-stack`
  gardent Shadow DOM.

Si une page a soudainement l'air sans style, vérifiez si elle utilise des classes globales
à l'intérieur d'un composant Shadow DOM. C'est généralement le problème.
