// Single source of truth for the app's URL → page mapping.
//
// Mado has no "file-based routes". You list pages explicitly, in order
// of specificity, and the router takes care of code-splitting via the
// dynamic imports below.
import { routes } from "@madojs/mado";

export const manifest = {
  // Public landing — `static: true` makes `mado release` snapshot this
  // route into `out/index.html` so search engines see a fully rendered
  // document without running JS.
  "/": () => import("./pages/home.page"),
  // Dynamic static route: `mado static` calls `paths()` at build time,
  // captures one HTML file per slug, and seeds `initialData` so the
  // first client render does not re-fetch what the snapshot already
  // shows.
  "/guide/:slug": () => import("./pages/guide.page"),
  // SPA-only route: deliberately non-static. Lives in `_mado/spa.html`
  // at deploy time and is served whenever the CDN cannot find a static
  // document.
  "/app": () => import("./pages/app.page"),
  // 404 — matched after every literal pattern.
  "*": () => import("./pages/not-found.page"),
};

export default routes(manifest);