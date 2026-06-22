// Route guards live in the auth module so they can be reused across
// app.routes.ts and any module that needs to gate UI by permission.
//
// A guard is a plain function: returns `true` to allow, returns a path
// (string) to redirect, or false to deny.

import { hasPermission, isAuthed } from "./auth.service";

export function requireAuth(): boolean | string {
  if (isAuthed()) return true;
  // Redirect to login. Real apps may want to preserve the original target
  // via a query param; keep simple here.
  return "/login";
}

export function requirePermission(perm: string): () => boolean | string {
  return () => {
    if (!isAuthed()) return "/login";
    if (!hasPermission(perm)) return "/";
    return true;
  };
}