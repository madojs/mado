// Single source of truth for the application route table.
//
// This file is the APP MAP. Reading it = understanding the app.
//
// One rule:
//   Modules export plain `routes` maps. The choice of SHELL and GUARD for
//   each zone of the app is made HERE, by wrapping a module's routes with
//   a `layout({...})` block.
//
// `manifest` is exported separately so `mado bake` can discover pages that
// declare `bake: { paths, data }`.

import { layout, routes } from "@madojs/mado";

import { requireAuth } from "./modules/auth/auth.public";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export const manifest = {
  // Public landing (no shell, no guard).
  "/": () => import("./modules/home/home.page"),

  // AUTH ZONE — centered card, no guard.
  "/login": layout({
    layout: () => import("./layouts/auth-shell.layout"),
    routes: authRoutes,
  }),

  // APP ZONE — header + nav, guarded by requireAuth.
  "/billing": layout({
    layout: () => import("./layouts/app-shell.layout"),
    guard: requireAuth,
    routes: billingRoutes,
  }),

  "*": () => import("./modules/home/not-found.page"),
};

export default routes(manifest);