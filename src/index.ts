/**
 * Mado — public API.
 *
 * Import everything from one place:
 *   import { signal, computed, effect, component, html, router } from '@madojs/mado';
 *
 * In the browser: connected via <script type="importmap">.
 * In Node: via `tsconfig.paths` (resolves to "./src/index.ts").
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
export { html, render, instantiate } from "./html/template.js";
export {
  unsafeHTML,
  ref,
  classMap,
  styleMap,
  isHtmlDirective,
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

export { each, list } from "./each.js";

// --- components ---
export { component } from "./component.js";
export type {
  ComponentContext,
  ComponentOptions,
  SetupFn,
  StyleInput,
} from "./component.js";

// --- styles ---
export { css, cssVars, adopt, scopeStyles } from "./css.js";
export type { CSSResult } from "./css.js";

// --- routing ---
export {
  router,
  queryParam,
  navigate,
} from "./router/navigation.js";
export { routes, prefetchPath } from "./router/manifest.js";
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

export { page, layout, isPage, isLayoutGroup } from "./page.js";
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
  FieldValidator,
  AsyncFieldValidator,
  FieldSchema,
  FieldArrayApi,
  Schema,
  UseFormOptions,
} from "./forms.js";

// --- DI ---
export { createContext, provide, inject } from "./context.js";
export type { Context } from "./context.js";

// --- persistence ---
export { persisted } from "./persisted.js";
export type { PersistedOptions, PersistedSignal } from "./persisted.js";

// --- lazy ---
export { lazy } from "./lazy.js";
export type { LazyOptions } from "./lazy.js";

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
