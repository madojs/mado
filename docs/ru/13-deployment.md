# Deployment

Один command, один artifact:

```bash
mado release
```

Результат:

```txt
out/
├── index.html
├── assets/
├── baked/
├── _redirects
└── _headers
```

`out/` можно деплоить на nginx, Cloudflare Pages, Netlify, S3/CloudFront или
GitHub Pages.

## Preview

```bash
mado release
mado preview
```

`mado preview` сервит `out/` как статический хост: baked HTML имеет приоритет,
а неизвестные пути падают в SPA fallback.

## VPS + nginx

```bash
mado release
rsync -avz --delete out/ user@server:/var/www/myapp/
```

В репозитории есть production `nginx.conf`: hashed bundles кешируются
immutably, HTML идет с `no-cache`, deep links работают через SPA fallback.

## Cloudflare / Netlify

```bash
mado release
npx wrangler pages deploy out --project-name=myapp
```

`_redirects` и `_headers` генерируются автоматически.

## Cache rules

| Path | Cache-Control |
|---|---|
| `/assets/main-*.js` | `public, max-age=31536000, immutable` |
| `/*.html` | `no-cache, must-revalidate` |
| other static files | `public, max-age=86400` |

Если hard refresh на deep link дает 404, проблема в fallback настройке хоста.
