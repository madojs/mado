# Structure du projet

Chaque nouveau projet Mado a la même structure. C'est une convention **obligatoire**.

```
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # configuration dev/build
├── index.html                # shell SPA et template pour bake
├── public/                   # assets statiques (favicon, images, robots.txt)
└── src/
    ├── main.ts               # entrée : mount router dans #app
    ├── routes.ts             # route manifest (default + named manifest)
    ├── pages/                # une page = un fichier = `export default page({...})`
    ├── components/           # composants réutilisables (x-*)
    ├── layouts/              # pages de layout (pour nested)
    └── lib/
        ├── api.ts            # tous les wrappers fetch
        ├── contexts.ts       # createContext(...)
        ├── theme.ts          # thèmes
        └── ...               # utilitaires, types, règles métier
```

## États Des Artefacts

| Dossier | Ce que c'est | Écrit par | Déployer ? |
|---|---|---|---|
| `src/` | sources TypeScript | vous | non |
| `dist/` | output `tsc`, native ESM pour dev | `mado build` | non |
| `public/` | assets statiques écrits par vous | vous | via `out/` |
| `out/` | artefact déployable : shell SPA + bundles + HTML baked promu | `mado release` | oui |

`mado release` = `typecheck` + Vite build (`out/assets/`) + `bake`
(HTML directement dans `out/<route>/index.html`) + `sitemap.xml` + copie de
`public/*`.

## Où mettre un nouveau fichier ?

| Quoi | Où |
|---|---|
| Page pour une nouvelle URL | `src/pages/foo.ts` + ajouter à `src/routes.ts` |
| Widget UI réutilisable | `src/components/foo-bar.ts` |
| Wrapper API | `src/lib/api.ts` (ajouter une méthode) |
| Contexte global (thème, utilisateur, i18n) | `src/lib/<nom>.ts` |
| Fonction pure sans UI | `src/lib/util/<nom>.ts` |

Si vous ne savez pas où — c'est un signal que **l'architecture souffre**.
Consultez l'équipe, **consignez** la réponse dans `docs/`.

## Règles de nommage

| Quoi | Style | Exemple |
|---|---|---|
| Fichier | kebab-case | `user-profile.ts` |
| Tag de composant | `x-` + kebab | `<x-user-profile>` |
| Context | PascalCase + `Ctx` | `ThemeCtx`, `AuthCtx` |
| Signal | camelCase | `userId`, `isLoggedIn` |
| Fonction de page (composant interne) | `x-<route>-page` | `<x-posts-page>` |

## Ce qui ne va PAS dans src/

- ❌ Configurations de build-tool (webpack, rollup, vite) — nous n'en avons pas.
- ❌ Fichiers `.env` — les variables d'environnement sont lues depuis `process.env`/`import.meta.env` dans `lib/config.ts`.
- ❌ Tests mélangés avec le code — tout dans `test/`.
