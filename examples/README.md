# Mado examples

Each browser example is a standalone SPA whose client router runs from root
(`/`, `/posts`, `/app/login`). The dev server mounts one example at `/` so the
behavior stays close to a production deploy.

```bash
npm install
npm run build

npm run serve             # example index
npm run serve -- basic
npm run serve -- tickets
npm run serve -- showcase
```

Same through the CLI:

```bash
mado examples
mado serve showcase
mado dev tickets
```

## Example Roles

| Example | Role |
|---|---|
| `basic/` | minimal start and API tour |
| `tickets/` | LLM zero-history CRUD validation |
| `showcase/` | flagship SaaS CRM pressure app |
| `cloudflare/` | deployment/edge example for Cloudflare Workers |

## Structure

```text
examples/
├── index.html        example index
├── basic/            minimal tour
├── tickets/          small ticket-admin SPA
├── showcase/         complex SaaS CRM pressure app
└── cloudflare/       Cloudflare Worker prerender/deploy example
```

All browser examples are built by one `npm run build`; `tsconfig.json` already
includes `examples/**/*.ts`.

## Add A Browser Example

1. Create `examples/<name>/`.
2. Add `index.html`:
   ```html
   <script type="importmap">
     {"imports": {"madojs": "/dist/src/index.js", "madojs/": "/dist/src/"}}
   </script>
   <script type="module" src="/dist/examples/<name>/main.js"></script>
   ```
3. Write `main.ts` and `routes.ts`.
4. Add a card to `examples/index.html`.
5. Verify: `npm run build && npm run serve -- <name>`.

`package.json` does not need separate `serve:<name>` scripts. The example is
selected by the CLI argument.

## Why Not `/examples/<name>/` As A Shared Prefix?

That works, but then each app needs a base path and links/routes become less
like production. Mounting one example at a time keeps the rule simple: the
example lives at root, like a normal SPA.
