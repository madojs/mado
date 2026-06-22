/**
 * Single source of truth for the Vite `base` URL prefix at runtime.
 *
 * Mado reads `import.meta.env.BASE_URL` once at module init and exposes
 * three pure helpers used by the router, navigation, head and any user
 * code that constructs internal links.
 *
 *   vite.config.ts → base
 *     ├── runtime: import.meta.env.BASE_URL      (this module)
 *     └── CLI:     resolved config → _mado/build.json
 *
 * There is intentionally NO `<meta name="mado:base">`, no
 * `routes({}, { base })`, no second runtime config. Tools that load Mado
 * outside Vite (native ESM tests, partial SSR probes) fall back to "/".
 */
let cached: string | null = null;

function readEnvBase(): string {
  // Direct access to the well-known constant so Vite's static
  // `define`-replacement (and Vite-only `import.meta.env.BASE_URL`
  // injection) sees the expression verbatim. Optional chaining or
  // intermediate variables would defeat the rewriter. In non-Vite
  // environments the property is undefined and we fall back to "/".
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (import.meta as any).env?.BASE_URL;
    if (typeof value === "string") return value;
  } catch {
    /* fall through */
  }
  return "/";
}

/**
 * Normalise an arbitrary base value into the canonical Mado form:
 * starts with "/", ends with "/", collapses repeated slashes. The root
 * base is the literal "/".
 *
 *   normalizeBase("")        === "/"
 *   normalizeBase("/")       === "/"
 *   normalizeBase("mado")    === "/mado/"
 *   normalizeBase("/mado")   === "/mado/"
 *   normalizeBase("/mado/")  === "/mado/"
 *   normalizeBase("//x//y/") === "/x/y/"
 */
export function normalizeBase(raw: string | null | undefined): string {
  if (!raw) return "/";
  let s = String(raw).trim();
  if (!s || s === "/") return "/";
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s = s + "/";
  s = s.replace(/\/+/g, "/");
  return s;
}

/**
 * The active base prefix for the running app. Computed once from
 * `import.meta.env.BASE_URL` and normalised. Use it inside Mado runtime;
 * application code should call `routeUrl()` instead.
 */
export const appBase: string = normalizeBase(readEnvBase());

/**
 * Strip the base prefix off a browser pathname so it becomes a route
 * pathname the matcher understands.
 *
 *   base = "/mado/"
 *   stripBase("/mado/")        === "/"
 *   stripBase("/mado/docs")    === "/docs"
 *   stripBase("/mado/docs/")   === "/docs"
 *   stripBase("/other")        === "/other"     (no base → unchanged)
 *   stripBase("")              === "/"
 *
 *   base = "/"
 *   stripBase("/docs")         === "/docs"
 */
export function stripBase(pathname: string, base: string = appBase): string {
  const b = normalizeBase(base);
  if (!pathname) return "/";
  if (b === "/") return pathname.startsWith("/") ? pathname : "/" + pathname;
  // Exact match of base without trailing slash → root.
  const bNoTrail = b.slice(0, -1);
  if (pathname === bNoTrail) return "/";
  if (pathname === b) return "/";
  if (pathname.startsWith(b)) {
    const rest = pathname.slice(b.length - 1); // keep leading slash
    return rest || "/";
  }
  // Pathname is outside our base (foreign link clicked, etc.); return it
  // unchanged so the caller can detect the mismatch and fall back to a
  // native navigation.
  return pathname;
}

/**
 * Prefix a route pathname with the active base so it becomes a real
 * browser URL suitable for `history.pushState` and `<a href>`.
 *
 *   base = "/mado/"
 *   withBase("/")          === "/mado/"
 *   withBase("/docs")      === "/mado/docs"
 *   withBase("/docs/", b)  === "/mado/docs/"
 *   withBase("docs")       === "/mado/docs"
 *
 *   base = "/"
 *   withBase("/docs")      === "/docs"
 */
export function withBase(pathname: string, base: string = appBase): string {
  const b = normalizeBase(base);
  const p = pathname || "/";
  const abs = p.startsWith("/") ? p : "/" + p;
  if (b === "/") return abs;
  if (abs === "/") return b.slice(0, -1) || "/"; // "/mado/" → "/mado"? prefer trailing
  // Strip leading slash from abs so we can concatenate with base ("/mado/").
  // If abs already starts with the base prefix, return it unchanged so we
  // do not double-prefix on accident.
  if (abs === b || abs.startsWith(b)) return abs;
  if (abs === b.slice(0, -1)) return abs;
  return b + abs.slice(1);
}

/**
 * Build an internal link URL: prefix the given route pathname with the
 * active Vite base, preserving query and hash. This is the canonical way
 * to emit `<a href>` values in Mado views.
 *
 *   import { routeUrl } from "@madojs/mado";
 *   html`<a data-link href=${routeUrl("/docs")}>Docs</a>`
 *
 *   base = "/mado/"
 *   routeUrl("/docs")              === "/mado/docs"
 *   routeUrl("/docs?q=1#h")        === "/mado/docs?q=1#h"
 *   routeUrl("/")                  === "/mado/"
 *
 *   base = "/"
 *   routeUrl("/docs")              === "/docs"
 */
export function routeUrl(pathname: string, base: string = appBase): string {
  if (!pathname) return withBase("/", base);
  // Split off ?query and #hash so we only run withBase on the pathname.
  let path = pathname;
  let suffix = "";
  const hashAt = path.indexOf("#");
  if (hashAt >= 0) {
    suffix = path.slice(hashAt) + suffix;
    path = path.slice(0, hashAt);
  }
  const queryAt = path.indexOf("?");
  if (queryAt >= 0) {
    suffix = path.slice(queryAt) + suffix;
    path = path.slice(0, queryAt);
  }
  if (path === "") path = "/";
  return withBase(path, base) + suffix;
}

/**
 * Cached invalidation hook for tests that need to swap the base at
 * runtime. Not part of the public API.
 *
 * @internal
 */
export function _resetBaseCacheForTests(next?: string): string {
  cached = next == null ? null : normalizeBase(next);
  return cached ?? appBase;
}

void cached; // keep type-only reference until tests opt in