// The blessed routes manifest for an admin app.
//
//   "/"          → public landing
//   "/login"     → centered auth layout
//   "/admin/*"   → admin shell with sidebar/topbar, guarded by requireAuth
//   "*"          → 404
//
// Layouts and guards live inside the layout() blocks. There is exactly one
// canonical place to put a shell: a layout() in this manifest. Do not wrap
// route output in main.ts or in custom-element wrappers — that path causes
// the "shell-below-content" bug described in the v1 plan.
//
// Bake: `manifest` is exported separately for `mado bake` to discover pages
// that declare `bake: { paths, data }`. Without this named export `mado bake`
// fails with a clear error.

import { layout, routes } from "@madojs/mado";
import { requireAuth } from "./lib/auth.js";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "/login": layout({
    layout: () => import("./layouts/auth.js"),
    routes: {
      "/": () => import("./pages/login.js"),
    },
  }),
  "/admin": layout({
    layout: () => import("./layouts/app.js"),
    guard: requireAuth,
    routes: {
      "/": () => import("./pages/admin/dashboard.js"),
      "/orders": () => import("./pages/admin/orders.js"),
      "/orders/:id": () => import("./pages/admin/order-detail.js"),
    },
  }),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);