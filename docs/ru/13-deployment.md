# Deployment

Одна команда, один deploy artifact:

```bash
mado release
```

Результат:

```txt
out/
├── index.html              ← SPA shell или baked HTML для /
├── assets/                 ← Vite hashed assets
│   ├── *.gz                ← precompressed gzip
│   └── *.br                ← precompressed brotli
├── <route>/index.html      ← baked HTML для static hosts
├── sitemap.xml             ← sitemap в root сайта
├── _redirects              ← Cloudflare Pages / Netlify SPA fallback
└── _headers                ← cache rules
```

`out/` можно деплоить на nginx, Cloudflare Pages, Netlify, S3/CloudFront или
GitHub Pages. Деплоится только `out/`.

## Preview

```bash
mado release
mado preview
```

`mado preview` сервит финальный `out/` как обычный static host: сначала реальные
файлы (`/<route>/index.html`, если route был baked), потом SPA fallback в
`index.html`. Preview проверяет ровно то, что будет загружено на хостинг.

## VPS + nginx

```bash
mado release
rsync -avz --delete out/ user@server:/var/www/myapp/
```

Опциональный nginx-рецепт лежит в `docs/recipes/nginx/`: assets кешируются
immutable, HTML идет с `no-cache`, deep links работают через SPA fallback.

## Cloudflare / Netlify

```bash
mado release
npx wrangler pages deploy out --project-name=myapp
```

`_redirects` и `_headers` генерируются автоматически, если ты не положил свои.
Baked routes промотируются в реальные файлы (`out/<route>/index.html`), поэтому
static host отдаст их до SPA fallback.

## Cache Rules

| Path | Cache-Control |
|---|---|
| `/assets/main-*.js` | `public, max-age=31536000, immutable` |
| `/*.html` | `no-cache, must-revalidate` |
| other static files | `public, max-age=86400` |

Если hard refresh на deep link дает 404, проблема в fallback настройке хоста.
