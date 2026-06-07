# Shadow DOM vs Light DOM

Les composants Mado utilisent Shadow DOM par défaut. C'est un bon défaut pour les widgets
autonomes, mais ce n'est pas le bon défaut pour chaque composant dans une application.

## Règle générale

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

## Leçon du Showcase

`examples/showcase` utilise cette séparation délibérément :

- `x-app` et les pages de route CRM sont Light DOM ;
- `x-app-layout` garde Shadow DOM car il possède un shell sidebar/contenu basé sur slot ;
- les utilitaires de tableau/formulaire/page vivent dans `styles/global.ts` ;
- les composants feuilles comme `x-stat-card`, `x-status-badge`, `x-modal` et `x-toast-stack`
  gardent Shadow DOM.

Si une page a soudainement l'air sans style, vérifiez si elle utilise des classes globales
à l'intérieur d'un composant Shadow DOM. C'est généralement le problème.
