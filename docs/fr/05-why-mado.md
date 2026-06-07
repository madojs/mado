# Pourquoi Mado (et pourquoi pas Lit / Solid / Alpine / htmx)

> Si vous choisissez un stack frontend pour un nouveau projet, cette page est pour vous.  
> Si vous avez déjà quelque chose qui fonctionne — **ne migrez pas pour le plaisir de migrer**, ça coûte toujours plus cher qu'il n'y paraît.

Mado n'est pas un "tueur" de React/Vue/Svelte. C'est un outil spécialisé. J'explique ici honnêtement **dans quels cas Mado est vraiment meilleur que les alternatives**, et dans lesquels il ne l'est pas.

---

## TL;DR — un seul tableau

| Si vous vous souciez de… | Choisissez |
|---|---|
| Meilleure infrastructure d'apprentissage / grand écosystème | **React** ou **Vue** |
| Design system de composants pour l'intégration dans n'importe quel framework | **Lit** |
| Top performance sur les grandes listes, "proche du vanilla" avec JSX | **Solid** ou **Svelte 5** |
| Amélioration progressive d'apps classiques rendues côté serveur | **htmx** + votre backend |
| "Saupoudrer" de la réactivité sur un site statique | **Alpine.js** |
| Outillage minimal, maximum de plateforme, tout dans une boîte (router + data + forms + SEO), lisible en une soirée | **Mado** ✓ |

Si votre cas ne tombe pas dans le dernier point — Mado n'est probablement pas le meilleur choix. C'est normal.

---

## Mado vs Lit

**Lit** est l'alternative la plus proche dans l'esprit. Même approche : Web Components + tagged templates + magie minimale.

| | Lit | Mado |
|---|---|---|
| Taille | ~6 Ko | ~16 Ko |
| Âge / support | ~10 ans, Google | 6 mois, auteur unique |
| Réactivité | décorateurs `@property` + `requestUpdate` manuel | signals (`signal`/`computed`/`effect`) intégrés |
| Router | aucun, vous devez en trouver un (`@lit-labs/router`, etc.) | inclus : `routes()` + nested + prefetch + sync-cache |
| Chargement de données | aucun, vous devez l'assembler | `resource()` + `mutation()` + invalidation glob |
| Forms | aucun | `useForm()` sur validation HTML5 native |
| SEO / statique | complexe (`@lit-labs/ssr`) | `bake` (linkedom) + edge-prerender |
| Build | nécessite esbuild/rollup/webpack | `tsc` suffit |
| Style de code | classes + décorateurs | fonctions + tagged templates |
| Écosystème | réel (Shoelace, Material Web, etc.) | aucun |
| Quand choisir | écrire un design system / bibliothèque Web Components pour l'intégration | écrire une application complète, vouloir tout dans une boîte |

**Pitch honnête :** *"Lit est meilleur si vous écrivez un design system de composants. Mado est meilleur si vous écrivez une application et voulez des batteries incluses sans assembler 8 packages."*

---

## Mado vs Solid

**Solid** est une bibliothèque réactive de premier plan construite sur les signals. Techniquement très impressionnant.

| | Solid | Mado |
|---|---|---|
| Taille | ~7 Ko | ~16 Ko |
| Performance | top-3 sur js-framework-benchmark | bonne, mais pas au top |
| Réactivité | signals (même classe d'idées) | signals |
| Templates | JSX (compilé en expressions réactives) | tagged template `html\`\`` |
| Modèle de composant | fonctions, nœuds virtuels Solid | Web Components |
| Build | Vite + babel-plugin-solid requis | `tsc` uniquement |
| Router | `@solidjs/router` | inclus |
| Données | `createResource` | `resource()` |
| SSR | sérieusement supporté (SolidStart) | intentionnellement absent |
| Écosystème | en croissance, ~50 packages | aucun |
| Quand choisir | besoin de top performance + JSX + prêt à configurer le build | vouloir tourner sans build / infrastructure minimale |

**Pitch honnête :** *"Solid est techniquement plus rapide et plus mature. Mais Solid nécessite Vite + un plugin babel. Mado ne nécessite rien d'autre que `tsc` — c'est 'ouvrir VS Code, F5, et travailler'. Si cette différence n'est pas critique — allez avec Solid."*

---

## Mado vs Svelte 5

**Svelte 5** avec les runes — aussi un modèle signal, aussi minimaliste.

| | Svelte 5 | Mado |
|---|---|---|
| Taille runtime | ~3 Ko | ~16 Ko |
| Compilateur | requis (.svelte → JS) | aucun |
| Syntaxe | format .svelte personnalisé | TS + tagged templates |
| Réactivité | `$state`/`$derived` (runes) | `signal`/`computed` |
| SSR / SvelteKit | complet, mature | intentionnellement absent |
| Écosystème | large, excellents dev-tools | aucun |
| Quand choisir | nouveau projet de production avec une équipe | outil privé/interne, besoin de simplicité |

**Pitch honnête :** *"Svelte est un choix produit. Mado est un choix ingénierie. Si vous avez une équipe et une app de production — Svelte. Si vous êtes seul et voulez le contrôle — Mado."*

---

## Mado vs htmx

**htmx** est une autre école : des fragments HTML sur le fil.

| | htmx | Mado |
|---|---|---|
| Architecture | HTML du serveur, mis à jour via des fragments | SPA : JS charge les données, se rend lui-même |
| Dépendance backend | forte (le backend doit pouvoir servir du HTML) | faible (le backend est une API JSON) |
| État client | minimal (cookies, localStorage) | complet (signal, persisted) |
| Mises à jour optimistes | difficiles | faciles (mutation + invalidates) |
| Offline / PWA | faible | correct |
| Taille | ~14 Ko | ~16 Ko |
| Quand choisir | app classique rendue côté serveur (Rails, Django, Phoenix), besoin de "revitaliser" | expérience SPA requise, backend est REST/GraphQL |

**Pitch honnête :** *"htmx — si le backend est solide et peut servir du HTML. Mado — si le backend sert du JSON et que vous avez besoin d'une expérience SPA complète."*

---

## Mado vs Alpine.js

**Alpine** — attributs réactifs directement dans le HTML.

| | Alpine | Mado |
|---|---|---|
| Objectif | améliorer du HTML statique | SPA complet |
| Taille | ~7 Ko | ~16 Ko |
| Gestion d'état | `x-data` localement | signals + context + persisted |
| Routage | aucun | inclus |
| TypeScript | faible | première classe |
| Quand choisir | sites statiques, landing pages, besoin de 5 boutons interactifs | app complète : pages, navigation, forms, données |

**Pitch honnête :** *"Alpine — pour l'interactivité sur les sites statiques. Mado — pour une application complète."*

---

## Mado vs React + écosystème

Je ne vais pas m'étendre là-dessus longtemps, car React est dans une **catégorie différente** en termes d'écosystème et de maturité. Mais si vous comparez sérieusement :

**React gagne :**
- écosystème massif : milliers de kits UI, milliers d'articles, tutoriels infinis ;
- les assistants IA (ChatGPT, Copilot) connaissent React mieux que tout ;
- meilleur marché de l'emploi ;
- meilleur support SSR (Next.js).

**Mado gagne :**
- taille de bundle des dizaines de fois plus petite ;
- zéro infrastructure (pas de Vite, pas de Babel, pas de 200 packages) ;
- lisible en une soirée — si quelque chose casse, ouvrez `src/` ;
- signals au lieu de hooks (pas de règles "ne peut pas être utilisé dans un if", pas de pièges de stale-closure) ;
- pas besoin de migrer entre les versions majeures.

**Quand choisir Mado plutôt que React :**
- projet de 1–3 personnes, pour des années à venir ;
- la taille du bundle est critique ;
- vous êtes fatigué du React fatigue et prêt à sacrifier l'écosystème pour la simplicité.

**Quand choisir React :**
- équipe de 5 personnes ou plus ;
- vous avez besoin de kits UI, vous avez besoin de l'écosystème ;
- un projet qui recrutera de nouvelles personnes sur le marché ;
- vous avez besoin de SSR avec hydratation (Next.js).

---

## L'argument le plus fort de Mado

Pas la taille, pas la performance, pas les signals — tout a de meilleurs concurrents.

> **"Ouvrez le source et lisez-le en une soirée. ~3500 lignes, 12 modules. Si quelque chose casse — vous n'allez pas sur une issue avec 3000 commentaires. Vous allez dans `src/router.ts` et lisez 500 lignes."**

C'est ce qu'on appelle la **propriété** — vous possédez le code, plutôt que de dépendre de celui de quelqu'un d'autre.

Pour les développeurs backend habitués aux petites bibliothèques compréhensibles (chi en Go, axum en Rust, FastAPI en Python), c'est un **sentiment familier**. Pour ceux à qui ça n'importe pas — prenez ce qui est plus grand et plus mature.

---

## Qu'en est-il de la performance ?

Honnêtement : **Mado n'est pas le plus rapide**. Le top-3 sur js-framework-benchmark sont Solid, Inferno et Svelte. Mado est plus proche de Lit / Preact en termes de caractéristiques.

Ce que Mado fait pour la performance par défaut :
- **`computed` lazy** (dirty-flag, pas eager) ;
- **planificateur de microtâche par batch** pour `signal.set` ;
- **réconciliation par clé** dans `each()` avec réutilisation réelle du DOM ;
- **rendu synchrone** pour les pages en cache dans le router ;
- **hover-prefetch** pour les chunks lazy ;
- **View Transitions API** pour des transitions fluides ;
- **`adoptedStyleSheets` partagés** pour le CSS ;
- **hints `modulepreload`** sur le serveur de développement.

C'est suffisant pour la plupart des applications. Si vous construisez Excel dans le navigateur ou une visualisation WebGL à 60fps — ce n'est pas ici (c'est Solid ou du JS natif).

---

## Résumé

Mado est un outil **ciblé** avec un positionnement honnête. Il est le plus fort quand :

1. Vous voulez **posséder** le code et le lire en entier.
2. La **simplicité d'infrastructure** est critique (pas de Vite/Webpack/Babel).
3. Vous avez besoin de **batteries dans une boîte** (router + données + forms + SEO).
4. Vous n'êtes pas junior et n'avez pas peur des Web Components.

Si même un seul point ne s'applique pas à vous — prenez une alternative du tableau ci-dessus. Ne vous battez pas avec un outil qui ne convient pas.

— L'auteur de Mado, ex-développeur React passé au backend qui maintenant colle des frontends dans ses temps libres.
