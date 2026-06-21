# Deployment

> **One command. One artifact. Many hosts.** `mado release` writes everything
> a static host needs into `out/`. The same `out/` can be pushed to nginx,
> Cloudflare Pages, Netlify, S3 or GitHub Pages without re-building.

## What `mado release` produces

```
out/
├── index.html              ← SPA shell or baked HTML for /
├── assets/                 ← Vite hashed assets
│   ├── *.gz                ← precompressed gzip (gzip_static / Accept-Encoding)
│   └── *.br                ← precompressed brotli (brotli_static / Accept-Encoding)
├── <route>/index.html      ← prerendered SEO HTML for baked routes
├── sitemap.xml             ← generated sitemap
├── favicon.svg             ← your public/ assets copied verbatim
├── _redirects              ← Cloudflare Pages / Netlify SPA fallback
└── _headers                ← Cloudflare Pages / Netlify cache rules
```

`_redirects` and `_headers` are generated automatically and only if they do
not already exist in your project. They are safely ignored by nginx and other
hosts.

## Local rehearsal

```bash
mado release
mado preview      # http://localhost:4173 — serves out/ exactly as a static host would
```

`mado preview` serves the final `out/` directory like a static host: it picks
`.br` over `.gz` over raw, serves promoted baked HTML when a route has an
`index.html`, and falls back to `index.html` for unknown SPA paths.

---

## Recipe 1: VPS + nginx

The framework ships a production-ready [`nginx.conf`](../../nginx.conf) with
`gzip_static`, immutable cache for hashed bundles, and SPA fallback. Drop
`out/` into the host and point nginx at it.

```bash
# Build the artifact locally
mado release

# Upload to the VPS
rsync -avz --delete out/ user@server:/var/www/myapp/

# On the VPS — first time only:
sudo cp /etc/nginx/conf.d/myapp.conf{,.bak}
sudo cp ./nginx.conf /etc/nginx/conf.d/myapp.conf
sudo nginx -t && sudo systemctl reload nginx
```

Key lines of the shipped `nginx.conf`:

- `gzip_static on;` — serves the precompressed `.gz` files written by
  `mado release`. Zero CPU at request time.
- `/assets/*` should be cached immutable; Vite filenames are content hashed.
- `try_files $uri $uri/ /index.html;` — SPA fallback so deep links work
  after a hard refresh.

Enable HTTPS with Let's Encrypt / Certbot. Add HSTS once you have it.

---

## Recipe 2: Cloudflare Pages

```bash
mado release
npx wrangler pages deploy out --project-name=myapp
```

- The generated `_redirects` (`/* /index.html 200`) gives you SPA fallback.
- The generated `_headers` (immutable cache for `/assets/*`, `no-cache` for
  HTML) is honored by CF Pages.
- Baked routes are promoted to real route files (`out/<route>/index.html`),
  so they take priority over the SPA fallback because CF Pages matches static
  files first.

For preview branches, set the same build command in the CF Pages project:

```
Build command:    npm ci && npx mado release
Output directory: out
```

For catalogs too big to bake at build time, keep edge prerender experiments in
the external examples workspace rather than in the core package.

---

## Recipe 3: Static-only hosts (S3, Netlify, GitHub Pages)

Any static host works because `out/` is just files. Pick whichever you have:

**Netlify**
```bash
mado release
npx netlify deploy --prod --dir=out
```
`_redirects` and `_headers` are recognized natively.

**S3 / CloudFront**
```bash
mado release
aws s3 sync out/ s3://my-bucket/ --delete \
  --cache-control "public, max-age=31536000, immutable" --exclude '*.html'
aws s3 sync out/ s3://my-bucket/ \
  --cache-control "no-cache, must-revalidate" --include '*.html'
```
Configure CloudFront's "Default root object" to `index.html` and add a custom
error response: 403/404 → `/index.html` with status 200 (SPA fallback).

**GitHub Pages**
```bash
mado release
# Push out/ into the gh-pages branch (or use actions/upload-pages-artifact)
```
Pages handles `index.html` automatically. There is no native SPA fallback;
add a `404.html` that loads the SPA, or use the
[`spa-github-pages`](https://github.com/rafgraph/spa-github-pages) trick.

---

## Cache-control matrix

| Path                         | Cache-Control                                    | Why                              |
|------------------------------|--------------------------------------------------|----------------------------------|
| `/assets/main-*.js`          | `public, max-age=31536000, immutable`            | hashed filename → never reuse    |
| `/assets/chunk-*.js`         | `public, max-age=31536000, immutable`            | same                             |
| `/*.html`                    | `no-cache, must-revalidate`                      | always reflect latest deploy     |
| Other static files           | `public, max-age=86400`                          | safe daily cache                 |

`mado release` writes these rules into `out/_headers` for CF / Netlify and
the shipped `nginx.conf` enforces them server-side.

---

## CI sketch (GitHub Actions)

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx mado release
      - uses: actions/upload-artifact@v4
        with:
          name: out
          path: out
          retention-days: 7
      # Pick one deploy step:
      # - run: rsync -avz out/ user@server:/var/www/myapp/
      # - run: npx wrangler pages deploy out --project-name=myapp
      # - run: npx netlify deploy --prod --dir=out
```

---

## Troubleshooting

- **404 on hard refresh of a deep link.** Your host did not pick up SPA
  fallback. nginx: check `try_files`. CF/Netlify: `_redirects` is present?
  S3+CloudFront: configure the 404 → `/index.html` (200) error response.
- **HTML is cached forever.** Either your host sent a default
  `Cache-Control: public, max-age=...` or you are sitting behind a CDN that
  ignores `no-cache`. Add an explicit rule mirroring the matrix above.
- **`/assets/*` files change but the browser keeps the old one.** They
  should not — the filename is hashed by Vite during `mado release`. If you bypassed
  build and shipped your own unhashed JS, give it a hash or short cache.
- **Baked SEO page shows `[object Object]`.** Should never happen after the
  v1 bake update — bake now raises a loud error in that case. If you see it,
  upgrade `@madojs/mado` and re-run `mado bake`.

See also: [`02-project-layout.md`](./02-project-layout.md) for the
`src/`/`public/`/`out/` model and [`03-static-bake.md`](./03-static-bake.md)
for the SEO bake mechanics.
