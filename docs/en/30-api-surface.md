# API surface

> What applications may import today, what remains internal, and what may
> still change before v1.

Mado's candidate public contract is intentionally small. Import application
code from the package root:

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

## Candidate public API

These names are supported application-facing imports today. They remain open
to evidence-driven breaking changes while Mado is pre-1.0; once v1 ships they
become SemVer-protected:

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

Before v1, a minor release may remove or reshape a public contract when
dogfooding shows that it is surprising, redundant or pushes application code
away from the browser platform. Such changes require focused regression tests,
an explicit migration note and updates to starters, docs and Mado UI in the
same development stage.

Patch releases remain compatible bug-fix releases. New root exports still
require an explicit API review: pre-1.0 freedom is not permission to grow the
surface casually.

After v1, documented public behavior follows the stability contract and
SemVer. Internal modules, emitted bundle shape and implementation details may
continue to change without notice.
