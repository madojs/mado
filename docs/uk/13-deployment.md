# Deployment

Одна команда, один artifact:

```bash
mado release
```

Результат:

```txt
out/
├── index.html
├── assets/
├── <route>/index.html
├── sitemap.xml
├── _redirects
└── _headers
```

`out/` можна деплоїти на nginx, Cloudflare Pages, Netlify, S3/CloudFront або
GitHub Pages.

```bash
mado release
mado preview
```

`mado preview` показує `out/` як статичний хост: baked HTML має пріоритет,
потім SPA fallback.

Для VPS + nginx:

```bash
mado release
rsync -avz --delete out/ user@server:/var/www/myapp/
```

Опційний nginx recipe живе в `docs/recipes/nginx/`: immutable cache для
`/assets/*`, no-cache для HTML та fallback для deep links.
