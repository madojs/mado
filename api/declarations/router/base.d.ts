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
export declare function normalizeBase(raw: string | null | undefined): string;
/**
 * The active base prefix for the running app. Computed once from
 * `import.meta.env.BASE_URL` and normalised. Use it inside Mado runtime;
 * application code should call `routeUrl()` instead.
 */
export declare const appBase: string;
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
export declare function stripBase(pathname: string, base?: string): string;
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
export declare function withBase(pathname: string, base?: string): string;
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
export declare function routeUrl(pathname: string, base?: string): string;
