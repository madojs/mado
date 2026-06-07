/**
 * Page contract — a uniform format for describing a page.
 *
 *   // pages/user-profile.ts
 *   import { page, html, resource, jsonFetcher } from '@madojs/mado';
 *
 *   export default page({
 *     title: ({ id }) => `User #${id}`,
 *     load:  ({ id }) => resource(() => `/api/users/${id}`, jsonFetcher()),
 *     view:  ({ params, data }) => html`
 *       <h1>${() => data?.data()?.name ?? '\u2026'}</h1>
 *     `,
 *   });
 *
 *   // routes.ts
 *   import { routes } from '@madojs/mado';
 *
 *   export default routes({
 *     '/users/:id': () => import('./pages/user-profile.js'),
 *   });
 *
 * The contract is strict: exactly three slots — title / load / view.
 * If a page exports something other than Page — tsc will stop it before build.
 * "One right way" — as in Rust: fewer branches, fewer bugs.
 */

import type { TemplateResult } from "./html.js";

/** Route params (values from :placeholders). */
export type RouteParams = Record<string, string>;

/**
 * Loaded data. If load returned a Resource — this is `Resource<T>`,
 * otherwise — a plain value. The view decides what to do with it.
 */
export type PageData<D> = D;

export interface PageContext<P extends RouteParams, D> {
  /** URL parameters. */
  params: P;
  /** Result of load() — usually Resource<T> with data/error/loading. */
  data: D;
  /** Current path (as a signal function). */
  path: () => string;
  /**
   * Child view (for layout components).
   * For regular pages always null.
   */
  child: TemplateResult | null;
}

/**
 * Metadata for <head>. Baked into HTML at bake(), and in SPA runtime
 * updated on the fly on route changes.
 */
export interface HeadMeta {
  /** If set — overrides page.title. */
  title?: string;
  description?: string;
  /** Canonical URL — important for SEO with duplicate content. */
  canonical?: string;
  /** OpenGraph for social networks. */
  og?: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
    url?: string;
  };
  /** Twitter Cards (inherits og.* if not set). */
  twitter?: {
    card?: "summary" | "summary_large_image";
    title?: string;
    description?: string;
    image?: string;
  };
  /** Arbitrary meta tags: { name: 'robots', content: 'index,follow' } */
  meta?: Array<{ name?: string; property?: string; content: string }>;
  /** Arbitrary link tags: { rel: 'alternate', href: '/en/...' } */
  link?: Array<{ rel: string; href: string; hreflang?: string }>;
  /** JSON-LD structure (Schema.org). Will be inserted as <script type="application/ld+json">. */
  jsonLd?: unknown;
}

/**
 * Bake configuration: gives the build script enough information
 * to pre-render static HTML for all instances of a page.
 */
export interface BakeConfig<P extends RouteParams, D> {
  /**
   * List of all params for which to bake a page.
   * Return a ready array (may fetch from API).
   */
  paths: () => Promise<P[]> | P[];
  /**
   * Data for specific params. Must be JSON-serialisable —
   * it is also embedded in the HTML inside
   * `<script type="application/json" id="bake">`
   * and used as `initialData` during hydration.
   */
  data: (params: P) => Promise<D> | D;
  /**
   * How many seconds before the data is considered stale (for CDN/edge cache).
   * Optional. Metadata only.
   */
  revalidate?: number;
}

export interface Page<P extends RouteParams = RouteParams, D = unknown> {
  readonly _page: true;
  title?: string | ((params: P) => string);
  load?: (params: P, baked?: D) => D;
  view: (ctx: PageContext<P, D>) => TemplateResult;
  /**
   * <head> metadata. Receives params and (opt.) data if pre-loaded
   * via bake.
   */
  head?: (params: P, data?: D) => HeadMeta;
  /**
   * Static HTML bake config. Used only in the bake script.
   * Ignored at runtime.
   */
  bake?: BakeConfig<P, D>;
  /**
   * Local error boundary. Catches errors from view() and load() of this page.
   * If not set — the global `error` from routes() is used.
   */
  errorView?: (err: Error, params: P) => TemplateResult;
}

/**
 * Page factory. A typed wrapper over a plain object —
 * needed only for type inference and the single "_page" stamp.
 */
export function page<P extends RouteParams = RouteParams, D = unknown>(
  spec: Omit<Page<P, D>, "_page">,
): Page<P, D> {
  return { _page: true, ...spec };
}

export const isPage = (v: unknown): v is Page =>
  typeof v === "object" && v !== null && (v as Page)._page === true;

// ---------- Routes manifest ----------

/**
 * Manifest entry — what should respond to a path.
 *   - Page                          → serve immediately, without import (for eager pages)
 *   - () => Promise<{default:Page}> → lazy via dynamic import
 *   - NestedRoutes                  → a group with a shared layout
 *
 * Using Page<any, any> so that user-defined page<{slug:string}>
 * can be assigned here (TS disallows Page<{slug:string}> → Page<RouteParams>
 * due to parameter contravariance).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPage = Page<any, any>;

export type RouteEntry =
  | AnyPage
  | (() => Promise<{ default: AnyPage }>)
  | NestedRoutes;

export interface NestedRoutes {
  readonly _nested: true;
  /** Layout page wrapping children. Will receive child=TemplateResult. */
  layout?: AnyPage | (() => Promise<{ default: AnyPage }>);
  /** Sub-routes. Keys are relative ("" , "users", "users/:id"). */
  routes: Record<string, RouteEntry>;
}

export function nested(spec: Omit<NestedRoutes, "_nested">): NestedRoutes {
  return { _nested: true, ...spec };
}

export const isNested = (v: unknown): v is NestedRoutes =>
  typeof v === "object" && v !== null && (v as NestedRoutes)._nested === true;
