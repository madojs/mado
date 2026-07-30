# Why Mado — and when not to choose it

> Choose a framework for the application you have, not for the migration you
> could invent. If an existing stack works, changing it only for novelty is
> usually the wrong trade.

Mado is a focused frontend framework for public sites and live applications.
It combines Web Components, signals, routing, data, forms and
browser-rendered static snapshots without a framework compiler or third-party
browser-runtime dependencies.

That coherence is its advantage. Its pre-1.0 status and smaller ecosystem are
real costs.

## Short answer

| Your primary requirement | Start with |
| --- | --- |
| Broad third-party integrations, training material and an established hiring pool | React or Vue |
| Interoperable Web Components for use across several host frameworks | Lit |
| A compiled JSX or component-language workflow with an established full-stack rendering path | SolidStart or SvelteKit |
| A backend that owns HTML and returns document fragments | htmx |
| Small enhancements on server-rendered or static HTML | Alpine.js |
| One browser-native TypeScript model for static documents and a live client application | **Mado** |

This table is a routing hint, not a benchmark. Validate the difficult part of
your own application before committing to any option.

## The trade Mado makes

Mado deliberately puts these concerns behind one contract:

- `component()` defines autonomous Web Components with scoped styles;
- `page()` defines route, data, head metadata, view and optional static
  capture;
- signals update individual template bindings;
- `routes()`, `resource()`, `mutation()` and `useForm()` cover common
  frontend application work;
- `mado release` builds the client and captures declared public routes in a
  real Chromium;
- Vite remains the development and delivery transport rather than becoming a
  second application framework.

In return, Mado deliberately does **not** provide a backend, server rendering,
hydration, a framework-specific compiler or compatibility with legacy
browsers.

## Mado and Lit

Mado and [Lit](https://lit.dev/) share important platform choices: Custom
Elements, Shadow DOM and tagged-template HTML.

Lit is centered on building reusable Web Components that can live in many host
environments. It provides a mature component base, reactive properties,
templating and lifecycle tools while leaving application routing, data and
delivery architecture open.

Mado is centered on building a complete frontend application. Its component
model is accompanied by pages, routing, resources, forms and static capture.

Choose Lit when the deliverable is primarily an interoperable component
library or design system. Choose Mado when the deliverable is the application
and one integrated contract is more valuable than selecting those layers
independently.

## Mado and Solid or Svelte

[Solid](https://docs.solidjs.com/) and [Svelte](https://svelte.dev/docs) offer
fine-grained reactive application models with compilation integrated into
their authoring workflows. Their surrounding application frameworks also
cover server and full-stack rendering modes that Mado intentionally excludes.

Mado uses plain TypeScript and tagged templates, produces real Custom Elements
for reusable components and has no framework compiler. Public documents come
from browser capture, followed by atomic client takeover rather than server
rendering and hydration.

Choose Solid or Svelte when their syntax, tooling, ecosystem or server
rendering path is a requirement. Choose Mado when staying close to browser
APIs and keeping one client-side mental model matters more.

## Mado and htmx

[htmx](https://htmx.org/docs/) normally asks the server for HTML or HTML
fragments and swaps the response into the document. It fits especially well
when the backend already owns rendering, authorization and navigation.

Mado normally treats the backend as an HTTP API. The browser owns route state,
reactive data, optimistic mutations and form interaction. Static public pages
are captured during release, but the production application does not need a
Node renderer.

Choose htmx when HTML is naturally the server's application protocol. Choose
Mado when the client is a substantial application with its own state and
navigation.

## Mado and Alpine.js

[Alpine.js](https://alpinejs.dev/) is a good fit for adding local behavior to
HTML that already exists. Mado owns an explicit route and component graph and
is intended for a complete frontend.

Choose Alpine when the page is primary and JavaScript is a small enhancement.
Choose Mado when pages, client navigation, shared data and reusable components
form one application.

## Mado and mainstream application frameworks

React and Vue have a breadth of libraries, integrations, educational material
and operational experience that a young framework cannot reproduce. If the
project depends on a specific vendor SDK, enterprise component suite, hosted
rendering platform or readily available specialist experience, that ecosystem
may decide the choice before syntax does.

Mado offers a narrower surface: one Vite transport, built-in frontend
primitives, browser standards and no third-party browser-runtime dependency in
core. That can reduce the number of independent contracts an application must
maintain, but it does not erase the cost of choosing a smaller project.

## The UI ecosystem, honestly

Mado does have an official UI path:
[`@madojs/ui`](https://github.com/madojs/ui) is a focused, open-code source
registry. Its CLI copies reviewed foundations, primitives, blocks and
templates into the application. The application owns and may change every
installed file, and no Mado UI runtime is shipped to the browser.

This provides a strong starting point, not a broad third-party marketplace.
If the application needs the depth of a mature commercial or community UI
ecosystem, verify that requirement before choosing Mado.

## Choose Mado when

- the product is a frontend, not a backend hidden inside a frontend
  framework;
- evergreen browser APIs are an acceptable platform baseline;
- public static documents and live SPA routes should share one page and
  component model;
- Web Components and Shadow DOM are useful boundaries for reusable UI;
- built-in routing, data, forms and release behavior are preferable to
  assembling several packages;
- the team accepts a pre-1.0 contract and can evaluate the source when an edge
  case appears.

## Do not choose Mado when

- request-time SSR, streaming HTML or server actions are requirements;
- the backend already renders HTML and only progressive enhancement is needed;
- a broad third-party UI or integration ecosystem is a hard dependency;
- legacy browser support is required;
- release infrastructure cannot provide a compatible Chromium for declared
  static routes;
- the project cannot absorb documented pre-1.0 migrations.

## Ownership and maintenance

Mado's ownership argument is not a frozen line count or a promise that no
migration will ever happen. It is structural:

- the public API is explicit and checked against a golden type surface;
- core behavior is split into focused TypeScript modules;
- application code uses browser primitives rather than framework-specific
  server abstractions;
- Mado UI installs editable source instead of adding another browser runtime;
- `AGENTS.md` and `llms.txt` make the current contract available to coding
  agents instead of relying on model memory.

When evaluating maintenance cost, inspect the actual package version, run
`npm run size`, read the relevant source path and prototype the application's
hardest interaction.

## Performance

Mado does not claim a benchmark rank. It supplies lazy computed values,
batched signal scheduling, keyed `each()` reconciliation, route chunk
prefetch, shared stylesheets and binding-level DOM updates.

Whether that is sufficient depends on the product. Measure the real route,
data volume, interaction latency and shipped artifact. A spreadsheet-scale
grid, media editor or graphics-heavy tool may need specialized rendering
regardless of the framework around it.

## Pre-1.0 means pre-1.0

Dogfooding may still reveal a simpler public contract. Before v1, a minor
release may include a documented migration; patch releases remain compatible
bug fixes. Read [the API surface](./30-api-surface.md),
[the v1 stability contract](./32-v1-stability.md) and the current changelog
instead of assuming permanence from marketing copy.

## Summary

Mado is a good fit when a team wants to build a browser-native frontend with
one understandable contract for components, pages, data, forms and static
delivery. It is a poor fit when the project primarily needs server rendering,
a large existing ecosystem or a stable mainstream hiring default.

That boundary is a feature: choose Mado for the work it is intentionally
designed to do.
