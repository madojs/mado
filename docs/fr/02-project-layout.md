# Structure du projet

Chaque nouveau projet Mado a la même structure. C'est une convention **obligatoire**.

```
my-app/
├── package.json              # exactement 1 dép : typescript (esbuild optionnel)
├── tsconfig.json             # avec paths "madojs" → import sans chemins relatifs
├── Dockerfile + nginx.conf   # copiés depuis Mado/ lors du scaffold
├── .gitlab-ci.yml | .github/workflows/ci.yml
├── server/serve.mjs          # dev-server de Mado, sans dépendances
├── scripts/
│   ├── bundle.mjs            # bundle de production esbuild
│   └── new.mjs               # générateur de pages
├── templates/                # templates pour new.mjs
├── docs/                     # documentation du projet (vous pouvez copier nos guides)
├── public/                   # assets statiques (favicon, manifests)
└── src/
    ├── main.ts               # entrée : providers + montage de <x-app>
    ├── routes.ts             # manifeste de routes
    ├── pages/                # une page = un fichier = `export default page({...})`
    ├── components/           # composants réutilisables (x-*)
    ├── layouts/              # pages de layout (pour nested)
    └── lib/
        ├── api.ts            # tous les wrappers fetch
        ├── contexts.ts       # createContext(...)
        ├── theme.ts          # thèmes
        └── ...               # utilitaires, types, règles métier
```

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
