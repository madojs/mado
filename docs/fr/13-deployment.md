# Déploiement

Une commande, un artefact :

```bash
mado release
```

Résultat :

```txt
out/
├── index.html
├── assets/
├── baked/
├── _redirects
└── _headers
```

Déploie `out/` sur nginx, Cloudflare Pages, Netlify, S3/CloudFront ou GitHub
Pages.

```bash
mado release
mado preview
```

`mado preview` sert `out/` comme un hébergeur statique : HTML baked d'abord,
fallback SPA ensuite.

Pour VPS + nginx :

```bash
mado release
rsync -avz --delete out/ user@server:/var/www/myapp/
```

Le `nginx.conf` fourni gère cache immutable pour les bundles hashés, no-cache
pour HTML, et fallback SPA pour les deep links.
