# API freeze map

> What is public, what is internal, and what SemVer will protect at v1.

Mado's v1 contract is intentionally small. Import application code from the
package root:

```ts
import { component, html, resource, routes, signal } from "@madojs/mado";
```

The public package subpaths are the devtools controller and the Vite tooling
integration:

```ts
import { devtools } from "@madojs/mado/devtools.js";
import { mado } from "@madojs/mado/vite";
```

Everything else under `dist/src/` is an implementation detail, even when it is
visible in the repository.

## Stable public API

These names are public and protected by SemVer once v1 ships:

- Reactivity: `signal`, `computed`, `effect`, `untracked`, `batch`,
  `flushSync`.
- Templates and directives: `html`, `render`, `unmount`, `each`, `unsafeHTML`,
  `ref`, `classMap`, `styleMap`.
- Components and CSS: `component`, `css`, `cssVars`.
- Routing and pages: `routes`, `router`, `page`, `layout`,
  `navigate`, `queryParam`, `prefetchPath`, `routeUrl`, `appBase`.
- Data: `resource`, `mutation`, `invalidate`, `jsonFetcher`, `HttpError`.
- Forms: `useForm`.
- Head and persistence: `applyHead`, `persisted`.
- Context: `createContext`, `provide`, `inject`.
- Advanced lifecycle helpers: `createLifecycle`, `runInLifecycle`,
  `getCurrentLifecycle`.
- Public TypeScript types exported from `@madojs/mado`, including `FormApi`,
  `Resource`, `ComponentContext`, `StaticPageConfig` and `HeadMeta`.

## Internal or unstable

These are not public API:

- Package subpaths other than `@madojs/mado`, `@madojs/mado/devtools.js`,
  and `@madojs/mado/vite`.
- Template parser/binding internals such as `html/parser.js`,
  `html/bindings.js`, `ChildState`, and `EachEntry`.
- Router implementation modules such as `router/match.js`,
  `router/navigation.js`, `router/manifest.js`, and `router/base.js`.
- Base-path helpers other than `routeUrl` / `appBase`: `normalizeBase`,
  `stripBase` and `withBase` are intentionally not exported from
  `@madojs/mado`. Use `routeUrl()` for `<a href>` values and `appBase`
  if you need the raw active prefix.
- The static snapshot pipeline (`scripts/static.mjs`, the
  `_mado/build.json` bridge, the temp capture server). `mado static` is
  a CLI command; its internals can change between minor versions.
- Diagnostics internals and all `_testHooks`.
- Exact generated bundle text, chunk names, and internal file layout.

The repository's tests may import internal files through relative `dist/` paths.
Application code should not.

## What can change

Patch and minor releases may add compatible options, diagnostics, docs or
starter files. New root exports require an explicit API review. Releases may change internals, emitted bundle shape, and
implementation details as long as the stable API and documented behavior remain
compatible.

Breaking changes to the stable API require a major version.
