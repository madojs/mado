# Carte de gel de l'API

> Ce qui est public, ce qui est interne, et ce que SemVer protégera en v1.

Le contrat v1 de Mado est volontairement petit. Le code applicatif importe
depuis la racine du package :

```ts
import { component, html, resource, routes, signal } from "@madojs/mado";
```

Le seul subpath public est le module side-effect devtools :

```ts
import "@madojs/mado/devtools.js";
```

Tout le reste sous `dist/src/` est un détail d'implémentation, même si le
fichier est visible dans le dépôt.

## API publique stable

Ces noms sont publics et protégés par SemVer une fois v1 publiée :

- Réactivité : `signal`, `computed`, `effect`, `untracked`, `batch`,
  `flushSync`.
- Templates et directives : `html`, `render`, `each`, `list`, `unsafeHTML`,
  `ref`, `classMap`, `styleMap`.
- Composants et CSS : `component`, `css`, `cssVars`.
- Routage et pages : `routes`, `router`, `page`, `layout`, `nested`,
  `navigate`, `queryParam`, `prefetchPath`.
- Data : `resource`, `mutation`, `invalidate`, `jsonFetcher`, `HttpError`.
- Formulaires : `useForm`.
- Head et persistence : `applyHead`, `persisted`.
- Context : `createContext`, `provide`, `inject`.
- Helpers lifecycle avancés : `createLifecycle`, `runInLifecycle`,
  `getCurrentLifecycle`.
- Types TypeScript publics exportés depuis `@madojs/mado`.

## Interne ou instable

Ce n'est pas de l'API publique :

- Subpaths du package autres que `@madojs/mado` et
  `@madojs/mado/devtools.js`.
- Internals du parser/binding comme `html/parser.js`, `html/bindings.js`,
  `ChildState` et `EachEntry`.
- Internals du routeur comme `router/match.js`, `router/navigation.js` et
  `router/manifest.js`.
- Internals de diagnostics et tous les `_testHooks`.
- Texte exact du bundle généré, noms des chunks et layout interne des fichiers.

Les tests du dépôt peuvent importer des fichiers internes via des chemins
relatifs `dist/`. Le code applicatif ne doit pas le faire.

## Ce qui peut changer

Les patch et minor releases peuvent ajouter des root exports, options,
diagnostics, docs ou starters. Elles peuvent aussi changer les internals, la
forme du bundle et les détails d'implémentation tant que l'API stable et le
comportement documenté restent compatibles.

Les changements cassants de l'API stable nécessitent une version majeure.
