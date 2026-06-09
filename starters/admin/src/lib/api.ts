// Blessed API client recipe.
//
// One JSON fetch wrapper. One error type. Bearer token from `accessToken`.
// A refresh path that asks `/api/auth/refresh` (HttpOnly cookie) and retries
// once. Aborts via `AbortSignal`. JSON in / JSON out.
//
// Copy and adjust to your backend. Keep `api` as the single fetch boundary so
// that auth, refresh, error parsing and tracing live in exactly one place.

import { signal } from "@madojs/mado";

/** Memory-only access token. Refresh restores it from an HttpOnly cookie. */
export const accessToken = signal<string | null>(null);

/** Typed HTTP error with structured `body` for the UI to inspect. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  /** JSON-serialisable body. If set, `content-type: application/json` is added. */
  json?: unknown;
  /** Override the default base URL for this call. */
  baseUrl?: string;
}

/**
 * Join a base path and a relative path without losing prefixes.
 * Works with both relative (`/api`) and absolute (`https://...`) bases.
 */
function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;

  const p = path.replace(/^\/+/, "");

  // Absolute URL base — keep its pathname prefix (for example /api).
  if (/^https?:\/\//.test(base)) {
    return new URL(p, base.replace(/\/+$/, "") + "/").href;
  }

  // Relative base (e.g. "/api") — simple string join, normalising slashes.
  const b = base.replace(/\/+$/, "");
  return p ? `${b}/${p}` : b || "/";
}

/**
 * Create an API client bound to a base URL. Returns an `api()` function that
 * speaks JSON, attaches the access token, and retries once after a 401 if a
 * refresh succeeds.
 *
 *   export const api = createApiClient("/api");
 *   const user = await api<User>("/users/me");
 *   await api("/posts", { method: "POST", json: { title: "hi" } });
 */
export function createApiClient(baseUrl: string) {
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const res = await fetch(joinUrl(baseUrl, "/auth/refresh"), {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as {
          accessToken?: string;
        } | null;
        if (!data?.accessToken) return false;
        accessToken.set(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(
    path: string,
    init: ApiInit = {},
    retried = false,
  ): Promise<T> {
    const url = joinUrl(init.baseUrl ?? baseUrl, path);
    const headers = new Headers(init.headers);
    if (init.json !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const token = accessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await fetch(url, {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
      body:
        init.json !== undefined
          ? JSON.stringify(init.json)
          : (init as RequestInit).body,
    });

    if (res.status === 401) {
      if (!retried && (await refresh())) {
        return request<T>(path, init, true);
      }
      accessToken.set(null);
      throw new ApiError(401, null, "Unauthorized");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(
        res.status,
        body,
        `HTTP ${res.status} ${res.statusText}`,
      );
    }
    if (res.status === 204) return null as unknown as T;
    return (await res.json()) as T;
  }

  return function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    return request<T>(path, init);
  };
}

/** Default app-wide client. Change the base URL via mado.config.json dev.proxy. */
export const api = createApiClient("/api");

/**
 * Fetcher for resource() that attaches the Bearer token automatically.
 * Use this instead of jsonFetcher() for protected endpoints:
 *
 *   const stats = resource(() => "/api/admin/stats", apiFetcher<Stats>());
 *
 * Unlike jsonFetcher(), this:
 *   - Sends the access token from memory (no cookie-based auth needed).
 *   - Does NOT prepend a base URL — the key is the full URL (matches
 *     resource key semantics).
 *   - Throws ApiError on non-2xx (consistent with api()).
 */
export function apiFetcher<T>(): (
  url: string,
  signal: AbortSignal,
) => Promise<T> {
  return async (url, abortSignal) => {
    const token = accessToken();
    const headers = new Headers();
    headers.set("accept", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await fetch(url, {
      signal: abortSignal,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      let body: unknown = null;
      try {
        const ct = res.headers.get("content-type") ?? "";
        body = ct.includes("json") ? await res.json() : await res.text();
      } catch {
        body = null;
      }
      throw new ApiError(
        res.status,
        body,
        `HTTP ${res.status} ${res.statusText}`,
      );
    }
    if (res.status === 204) return null as unknown as T;
    return (await res.json()) as T;
  };
}
