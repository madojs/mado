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
 *   // app.routes.ts
 *   import { routes } from '@madojs/mado';
 *
 *   export default routes({
 *     '/users/:id': () => import('./modules/users/pages/user-profile.page.js'),
 *   });
 *
 * The contract is strict: exactly three slots — title / load / view.
 * If a page exports something other than Page — tsc will stop it before build.
 * "One right way" — as in Rust: fewer branches, fewer bugs.
 */

import type { TemplateResult } from "./html/template-types.js";

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
  /**
   * Register cleanup that runs when the page navigates away.
   * Use for timers, manual subscriptions, or anything not automatically
   * managed by resource()/effect().
   *
   *   view: ({ onDispose }) => {
   *     const id = setInterval(tick, 3000);
   *     onDispose(() => clearInterval(id));
   *     return html`...`;
   *   }
   */
  onDispose?: (fn: () => void) => void;
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

/**
 * Guard verdict.
 *
 *   undefined / void / true → pass: continue to the next guard or render the page.
 *   false / { halt: true }  → stop: render nothing.
 *   string                  → redirect to that path.
 *   { redirect: url }       → navigate to `url`.
 */
export type GuardResult =
  | void
  | undefined
  | boolean
  | string
  | { halt: true }
  | { redirect: string; replace?: boolean };

/**
 * Guard function. Runs before a page (or any page in a layout group) is rendered.
 *
 *   const requireAuth: Guard = ({ path }) => {
 *     if (isLoggedIn()) return;
 *     return { redirect: `/login?return=${encodeURIComponent(path)}` };
 *   };
 *
 * Guards can be async. They are evaluated in order: each parent group's guards
 * first (outer → inner), then the page's own guards. The first non-pass verdict
 * wins.
 */
export type Guard = (ctx: {
  params: RouteParams;
  path: string;
}) => GuardResult | Promise<GuardResult>;

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
  /**
   * Route guards for this page. Evaluated after any guards from the
   * enclosing layout groups. See `Guard` for the verdict contract.
   */
  guard?: Guard | Guard[];
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
 *   - LayoutRoutes                  → a route group with a shared layout
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
  | LayoutRoutes;

export interface LayoutRoutes {
  readonly _layout: true;
  /** Layout page wrapping children. Will receive child=TemplateResult. */
  layout?: AnyPage | (() => Promise<{ default: AnyPage }>);
  /** Sub-routes. Keys are relative ("" , "users", "users/:id"). */
  routes: Record<string, RouteEntry>;
  /**
   * Guards applied to every page below this group, before the page's own
   * guards. Single guard or ordered array. Async OK.
   */
  guard?: Guard | Guard[];
}

/**
 * `layout()` creates a route group with a shared shell:
 *
 *   "/admin": layout({
 *     layout: () => import("./layouts/admin.js"),
 *     guard:  () => import("./lib/auth.js").then(m => m.requireAuth),
 *     routes: {
 *       "/":        () => import("./pages/admin/dashboard.js"),
 *       "/orders":  () => import("./pages/admin/orders.js"),
 *     },
 *   })
 */
export function layout(spec: Omit<LayoutRoutes, "_layout">): LayoutRoutes {
  return { _layout: true, ...spec };
}

export const isLayoutGroup = (v: unknown): v is LayoutRoutes =>
  typeof v === "object" && v !== null && (v as LayoutRoutes)._layout === true;
