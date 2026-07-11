/**
 * Mado — public API.
 *
 * Import everything from one place:
 *   import { signal, computed, effect, component, html, router } from "@madojs/mado";
 *
 * Vite is the canonical transport: every official starter, generator
 * and CLI command resolves `@madojs/mado` from `node_modules` through
 * the Vite plugin (`@madojs/mado/vite`). Native ESM consumers (tests,
 * partial-SSR probes) get the same surface area; anything that touches
 * `import.meta.env.BASE_URL` falls back to "/" outside Vite.
 */

// --- core ---
export {
  signal,
  computed,
  effect,
  untracked,
  batch,
  flushSync,
} from "./signal.js";
export type { Signal, Computed, ComputedOptions, Disposer } from "./signal.js";

// --- rendering ---
export { html, render, unmount } from "./html/template.js";
export {
  unsafeHTML,
  ref,
  classMap,
  styleMap,
} from "./html/bindings.js";
export type { TemplateResult } from "./html/template-types.js";
export type {
  HtmlDirective,
  UnsafeHTMLDirective,
  RefCallback,
  RefDirective,
  ClassMap,
  ClassMapDirective,
  StyleMap,
  StyleMapDirective,
} from "./html/bindings.js";

export { each } from "./each.js";

// --- components ---
export { component } from "./component.js";
export type {
  ComponentContext,
  ComponentOptions,
  SetupFn,
  StyleInput,
} from "./component.js";

// --- styles ---
export { css, cssVars } from "./css.js";
export type { CSSResult } from "./css.js";

// --- routing ---
export {
  router,
  queryParam,
  navigate,
} from "./router/navigation.js";
export { routes, prefetchPath } from "./router/manifest.js";
// Application code should use `routeUrl()` exclusively for building
// internal links. `appBase` is exposed for integrations that need to
// read the active prefix (e.g. building absolute canonical URLs from a
// component). `normalizeBase`, `stripBase` and `withBase` are
// implementation details: they remain unexported until a concrete
// downstream use case appears.
export { appBase, routeUrl } from "./router/base.js";
export type {
  RouterApi,
  QueryParam,
  QuerySignal,
} from "./router/navigation.js";
export type {
  RouteHandler,
  RouteParams,
  Routes,
  RoutesMap,
} from "./router/match.js";
export type { RoutesOptions } from "./router/manifest.js";

export { page, layout } from "./page.js";
export type {
  Page,
  PageContext,
  PageData,
  RouteEntry,
  LayoutRoutes,
  HeadMeta,
  StaticPageConfig,
  Guard,
  GuardResult,
  JsonPrimitive,
  JsonValue,
} from "./page.js";

export { applyHead } from "./head.js";

// --- data ---
export {
  resource,
  mutation,
  invalidate,
  jsonFetcher,
  HttpError,
} from "./resource.js";
export type {
  Resource,
  ResourceOptions,
  Mutation,
  MutationOptions,
} from "./resource.js";

// --- forms ---
export { useForm } from "./forms.js";
export type {
  FormApi,
  FormValue,
  FormValues,
  FormErrors,
  FormTouched,
  FormValidator,
  FormValidationContext,
  UseFormOptions,
} from "./forms.js";

// --- DI ---
export { createContext, provide, inject } from "./context.js";
export type { Context } from "./context.js";

// --- persistence ---
export { persisted } from "./persisted.js";
export type { PersistedOptions, PersistedSignal } from "./persisted.js";

// --- lifecycle (advanced API) ---
//
// Normally you don't need this: inside component() the lifecycle is created
// automatically. Only needed if you want to use resource() or
// other helpers outside a component and still get cleanup.
export {
  getCurrentLifecycle,
  runInLifecycle,
  createLifecycle,
} from "./lifecycle.js";
export type { Lifecycle, LifecycleHandle } from "./lifecycle.js";
