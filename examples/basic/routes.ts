/**
 * routes.ts: the single source of truth for the app URL graph.
 *
 * Open this file and you see every route. No folder scanners,
 * no [id]/(group)/_layout conventions, only an object.
 *
 * Every right-hand side is either:
 *   1. () => import('./pages/foo.js')   — lazy + code split (recommended)
 *   2. a ready page({...})              — eager
 *   3. nested({ layout, routes: {...} }) — layout group (see docs)
 *
 * Export both default (RouterApi for runtime) and manifest (for bake).
 */

import { routes, html, type RoutesMap } from "madojs";

export const manifest: RoutesMap = {
  "/": () => import("./pages/home.js"),
  "/about": () => import("./pages/about.js"),
  "/posts": () => import("./pages/posts.js"),
  "/contact": () => import("./pages/contact.js"),
  "/product/:slug": () => import("./pages/product.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, {
  loading: () => html`<p style="opacity:.6">loading…</p>`,
  error: (err) => html`<pre class="err">${err.message}</pre>`,
  titleSuffix: " · Mado demo",
});
