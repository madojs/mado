// THE single import surface other modules (and app.routes.ts) may use to
// reach into `auth`. Anything not re-exported here is private to the module.
// ESLint enforces it.
//
// Re-export only what callers should actually depend on.

export { requireAuth, requirePermission } from "./auth.guard";
export { hasPermission, hasRole, isAuthed, isBooting, login, logout, user } from "./auth.service";
export type { Credentials, User, UserId } from "./auth.types";