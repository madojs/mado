# Edge prerender (Cloudflare Workers PoC)

> Proof of concept: SEO for dynamic pages without server SSR or hydration,
> directly at the edge.

## Idea

Instead of running a Node server with hydration, the Worker does the same kind
of work that `npm run bake` does at build time, but on demand:

1. Request reaches the edge: `GET /product/iphone-15`.
2. Worker checks KV cache.
3. If fresh HTML exists, it returns it quickly.
4. If not, it runs a small `linkedom + bake`-style render at the edge, stores
   the result in KV with TTL, and returns it.
5. Real users still get the normal Mado SPA after HTML loads.

This is **not SSR with hydration**. It is **on-demand static prerender with CDN
cache**. It covers many SEO cases without hydration complexity or large servers.

## Fits

- Product catalogs, blogs and documentation with many pages.
- Content that does not change every second.
- SEO-critical pages where crawlers need ready HTML.

## Does Not Fit

- Per-user rendering, such as a user name in the header or a personalized cart.
- Real-time content such as stock prices or chat.
- Hydration. Mado still renders from scratch on the client; HTML is for crawlers
  and first paint.

## Structure

```text
examples/cloudflare/
├── README.md
├── wrangler.toml
├── src/
│   └── worker.ts
└── package.json
```

## Run Locally

```bash
cd examples/cloudflare
npm install
npm run dev
```

## Deploy

1. Create a Cloudflare account.
2. `npm install -g wrangler && wrangler login`.
3. Create a KV namespace: `wrangler kv namespace create PRERENDER`.
4. Copy the returned ID into `wrangler.toml` (`kv_namespaces[0].id`).
5. `npm run deploy`.

## Architecture

```text
Crawler (Googlebot) → Cloudflare Worker → KV cache
                                 │
                                 └── cache miss → origin API

Real user receives the same HTML first, then the normal Mado SPA starts.
```

The Worker only provides the first meaningful HTML for crawlers and faster
first paint. The Mado client app continues to work as usual.
