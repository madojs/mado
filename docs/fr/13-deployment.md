# Déploiement

Une commande, un artefact déployable :

```bash
mado release
```

Résultat :

```txt
out/
├── index.html              ← shell SPA ou HTML baked pour /
├── assets/                 ← assets Vite hashés
│   ├── *.gz                ← gzip précompressé
│   └── *.br                ← brotli précompressé
├── <route>/index.html      ← HTML baked pour les hébergeurs statiques
├── sitemap.xml             ← sitemap à la racine du site
├── _redirects              ← fallback SPA Cloudflare Pages / Netlify
└── _headers                ← règles de cache
```

Déploie `out/` sur nginx, Cloudflare Pages, Netlify, S3/CloudFront ou GitHub
Pages. Ne déploie pas `dist/` : c'est un output interne.

## Preview

```bash
mado release
mado preview
```

`mado preview` sert le `out/` final comme un hébergeur statique : fichiers réels
d'abord (`/<route>/index.html` si la route est baked), fallback SPA ensuite.
Preview vérifie exactement ce qui sera déployé.

## VPS + nginx

```bash
mado release
rsync -avz --delete out/ user@server:/var/www/myapp/
```

La recette nginx optionnelle vit dans `docs/recipes/nginx/`. Elle gère le cache
immutable pour `/assets/*`, no-cache pour HTML, et le fallback SPA pour les deep
links.

## Cloudflare / Netlify

```bash
mado release
npx wrangler pages deploy out --project-name=myapp
```

`_redirects` et `_headers` sont générés automatiquement si tu n'en fournis pas.
Les routes baked sont promues en vrais fichiers (`out/<route>/index.html`), donc
l'hébergeur statique les sert avant le fallback SPA.
