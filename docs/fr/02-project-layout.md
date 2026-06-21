# Structure du projet

Chaque application Mado utilise la même forme canonique. Cette convention
permet aux humains et aux assistants IA de savoir où placer le code.

```txt
my-app/
├── package.json              # runtime dep: @madojs/mado
├── tsconfig.json             # strict TS, ES2022, Bundler resolution
├── vite.config.ts            # mado() from @madojs/mado/vite
├── index.html                # entrée Vite + shell SPA
├── public/                   # assets statiques: favicon, images, robots.txt
└── src/
    ├── main.ts               # importe le CSS et monte le router dans #app
    ├── app.routes.ts         # app map: manifest + default routes(...)
    ├── layouts/              # layouts de zones d'application
    ├── shared/               # ui, http, lib, styles
    └── modules/              # bounded contexts
        └── billing/
            ├── billing.routes.ts
            ├── billing.public.ts
            ├── billing.types.ts
            ├── pages/
            ├── data/
            ├── api/
            └── _contracts/
```

## États Des Artefacts

| Dossier | Ce que c'est | Écrit par | Déployer ? |
| --- | --- | --- | --- |
| `src/` | sources TypeScript | vous | non |
| `public/` | assets statiques copiés tels quels | vous | via `out/` |
| `out/` | artefact déployable: shell SPA + assets + HTML baked | `mado release` | oui |

`mado release` = `typecheck` + build Vite (`out/index.html`, `out/assets/`,
`public/*`) + `bake` directement dans les chemins de routes + `sitemap.xml` +
precompression.

`index.html` reste à la racine car Vite le traite comme entry template. Mettez
dans `public/` uniquement les fichiers à copier tels quels.

## Où mettre un nouveau fichier ?

| Quoi | Où |
| --- | --- |
| Page pour une nouvelle URL | `src/modules/<module>/pages/<name>.page.ts` + module routes |
| Route map de module | `src/modules/<module>/<module>.routes.ts` |
| App shell/layout | `src/layouts/<zone>.layout.ts` |
| Widget UI partagé | `src/shared/ui/<x-name>.component.ts` |
| Widget UI propre à un module | `src/modules/<module>/components/<name>.component.ts` |
| API connector | `src/modules/<module>/api/<provider>.connector.ts` |
| Data resource/mutation | `src/modules/<module>/data/<name>.resource.ts` |
| Auth/session | `src/modules/auth/` |
| Surface publique de module | `src/modules/<module>/<module>.public.ts` |
| Fonction pure sans UI | `src/shared/lib/<name>.ts` |
| Image statique / favicon | `public/<file>` |
| CSS de shell | `src/shared/styles/shell.css` |
| CSS de contenu page | `src/shared/styles/content.css` |

## Vite Config

```ts
import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [mado()],
  css: {
    transformer: "lightningcss",
  },
});
```

Le starter active le transformer Lightning CSS de Vite. Mado ne possède pas le
prefixing, le lowering CSS ou la minification.

## Ce qui ne va PAS dans `src/`

- Configs de build-tool supplémentaires — utilisez `vite.config.ts`.
- Fichiers `.env` — lisez l'env dans `src/shared/lib/config.ts` puis importez
  ce module.
- Tests mélangés au code — gardez-les dans `test/`.
