// Blessed auth recipe: memory-only access token + HttpOnly-cookie refresh +
// `requireAuth` guard for use in nested route groups.
//
// Usage in routes.ts:
//
//   "/admin": layout({
//     layout: () => import("./layouts/app.js"),
//     guard:  requireAuth,
//     routes: { ... },
//   })
//
// When a user lands on a protected route, requireAuth() tries to silently
// restore the access token via the refresh cookie. If that fails, it redirects
// to `/login?return=<original-url>`. The login page reads `return` and
// navigates back after a successful sign-in.

import type { Guard } from "@madojs/mado";
import { accessToken, api, ApiError } from "./api.js";

let restorePromise: Promise<boolean> | null = null;

/**
 * Try once per session to restore the access token from the HttpOnly refresh
 * cookie. Subsequent calls reuse the same promise so a hard refresh that hits
 * five protected routes does not fire five refresh requests.
 */
export async function restoreSession(): Promise<boolean> {
  if (accessToken()) return true;
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    try {
      const data = await api<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
      });
      accessToken.set(data.accessToken);
      return true;
    } catch (e) {
      // 401 is expected for unauthenticated visitors.
      if (e instanceof ApiError && e.status === 401) return false;
      return false;
    } finally {
      restorePromise = null;
    }
  })();
  return restorePromise;
}

/**
 * Route guard: only let the user in if they have a valid session. Otherwise
 * redirect to /login, preserving the original URL as `?return=`.
 */
export const requireAuth: Guard = async ({ path }) => {
  if (accessToken()) return;
  if (await restoreSession()) return;
  return {
    redirect: `/login?return=${encodeURIComponent(path)}`,
    replace: true,
  };
};

export interface LoginCredentials {
  email: string;
  password: string;
}

/** Log in. Persists the access token in memory; refresh cookie is set by the server. */
export async function login(creds: LoginCredentials): Promise<void> {
  const data = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    json: creds,
  });
  accessToken.set(data.accessToken);
}

/** Log out everywhere: drop token in memory and tell the server to invalidate the refresh cookie. */
export async function logout(): Promise<void> {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // Best-effort; even if the network is offline we still clear locally.
  }
  accessToken.set(null);
}