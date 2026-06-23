import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { detectContext, getPackageRoot, resolveProjectPath } from "../_config.mjs";
import { assertJsonSerializable } from "./serialize.mjs";

/**
 * Build-time route discovery for static snapshots.
 *
 * Uses Vite's SSR module loader as a *control plane only* — no templates
 * or components are rendered in Node. Routing, flattening, param
 * extraction and pathname materialisation reuse the canonical helpers
 * exported by src/router/match.ts so the discovery pipeline never drifts
 * out of sync with the runtime router.
 */
export async function discoverStaticRoutes(options) {
  const projectRoot = resolve(options.projectRoot);
  const context = detectContext(projectRoot);
  const entry = resolveProjectPath(projectRoot, options.entry ?? pickDefaultEntry(projectRoot));

  if (!existsSync(entry)) {
    // Throwing — rather than `process.exit()` — lets the outer
    // `scripts/static.mjs` finalize its temp-directory cleanup before
    // the process terminates.
    throw new Error(
      `[mado:static] entry not found: ${entry}\n` +
        `[mado:static] expected src/app.routes.ts or src/routes.ts; ` +
        `pass --entry <file> to override`,
    );
  }

  installNodeDomStubs();

  let createViteServer;
  try {
    ({ createServer: createViteServer } = await import("vite"));
  } catch {
    throw new Error(
      "[mado:static] package 'vite' is required.\n" +
        "[mado:static] Install it as a dev dependency in this project:\n" +
        "[mado:static]   npm i -D vite playwright-core",
    );
  }

  // Two facts to keep in sync:
  //   1. In-repo runs MUST resolve `@madojs/mado` to the live source so the
  //      framework can test itself without a build artefact.
  //   2. App runs need our routing helpers loaded through SSR alongside the
  //      user manifest; we expose them via `__mado_match__` so we can ask
  //      for them via ssrLoadModule without colliding with user imports.
  const aliases = {
    __mado_match__: resolve(getPackageRoot(), "src/router/match.ts"),
    ...(context === "repo"
      ? { "@madojs/mado": resolve(projectRoot, "src/index.ts") }
      : {}),
  };

  const viteServer = await createViteServer({
    root: projectRoot,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
    resolve: { alias: aliases },
  });

  try {
    // Load the canonical routing utilities through the SAME Vite SSR loader
    // that loads the user manifest, so both halves see one consistent copy
    // of @madojs/mado. Try the source first (works in-repo) and fall back
    // to a direct import for app contexts where the package may not be
    // resolvable through Vite's SSR alias chain.
    const { flatten, paramKeys, applyParams, isPage } = await loadCoreHelpers(viteServer);

    const routesModule = await viteServer.ssrLoadModule(toViteId(entry));
    const manifest = routesModule.manifest ?? routesModule.default?.manifest;
    if (!manifest) {
      throw new Error(
        `${entry} must export const manifest = {...} (the same object passed to routes()).`,
      );
    }

    const records = [];
    const seen = new Map();
    for (const [pattern, flat] of flatten(manifest)) {
      const page = await resolvePage(flat.loader, pattern, isPage);
      if (!page?.static) continue;

      validateStaticRoute(pattern, flat, page, paramKeys);
      for (const layoutLoader of flat.layouts) {
        const layout = await resolvePage(layoutLoader, `${pattern} layout`, isPage);
        if (layout?.guard) {
          throw new Error(`[mado:static] ${pattern}: static routes cannot use guarded layouts.`);
        }
      }

      const config = page.static === true ? {} : page.static;
      const paramsList = await resolveParams(pattern, config, paramKeys);
      for (const params of paramsList) {
        const pathname = applyParams(pattern, params);
        if (seen.has(pathname)) {
          throw new Error(
            `[mado:static] duplicate generated URL ${pathname} from ${pattern}; ` +
              `already produced by ${seen.get(pathname)}.`,
          );
        }
        seen.set(pathname, pattern);

        const record = {
          pattern,
          pathname,
          params,
        };
        if (config.initialData) {
          const initialData = await config.initialData(params);
          assertJsonSerializable(initialData, `${pattern} -> ${pathname}`);
          record.initialData = initialData;
        }
        records.push(record);
      }
    }

    records.sort((a, b) => a.pathname.localeCompare(b.pathname));
    return { entry, records };
  } finally {
    await viteServer.close();
  }
}

function validateStaticRoute(pattern, flat, page, paramKeys) {
  if (pattern === "*") {
    throw new Error("[mado:static] wildcard routes cannot be static.");
  }
  if (flat.guards.length > 0) {
    throw new Error(`[mado:static] ${pattern}: static routes cannot inherit layout guards.`);
  }
  if (page.guard) {
    throw new Error(`[mado:static] ${pattern}: guarded pages cannot be static.`);
  }
  if (pattern.includes("*")) {
    throw new Error(`[mado:static] ${pattern}: wildcard routes cannot be static.`);
  }
  const keys = paramKeys(pattern);
  if (keys.length > 0 && page.static === true) {
    throw new Error(`[mado:static] ${pattern}: dynamic static routes must provide static.paths().`);
  }
  if (keys.length > 0 && !page.static.paths) {
    throw new Error(`[mado:static] ${pattern}: dynamic static routes must provide static.paths().`);
  }
}

async function resolveParams(pattern, config, paramKeys) {
  const keys = paramKeys(pattern);
  const paramsList = config.paths ? await config.paths() : [{}];
  if (!Array.isArray(paramsList)) {
    throw new Error(`[mado:static] ${pattern}: static.paths() must return an array.`);
  }
  if (keys.length === 0 && !config.paths) return [{}];
  for (const params of paramsList) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new Error(`[mado:static] ${pattern}: static.paths() must return params objects.`);
    }
    for (const key of keys) {
      if (params[key] == null) {
        throw new Error(`[mado:static] ${pattern}: missing route param "${key}".`);
      }
    }
  }
  return paramsList;
}

async function loadCoreHelpers(viteServer) {
  // The Vite resolve.alias bridge maps `__mado_match__` to the live source
  // file of this package, so the user manifest and discovery share the
  // exact same routing helper functions (same function identity).
  try {
    const mod = await viteServer.ssrLoadModule("__mado_match__");
    if (mod?.flatten && mod?.paramKeys && mod?.applyParams && mod?.isPage) {
      return mod;
    }
  } catch (err) {
    // Try the build artefact for published-only installs.
    const distPath = resolve(getPackageRoot(), "dist/src/router/match.js");
    if (existsSync(distPath)) {
      const mod = await import(distPath);
      if (mod?.flatten && mod?.paramKeys && mod?.applyParams && mod?.isPage) {
        return mod;
      }
    }
    throw new Error(
      `[mado:static] failed to load core routing helpers: ${err.message}`,
    );
  }
  throw new Error(
    "[mado:static] core routing helpers loaded but missing expected exports.",
  );
}

async function resolvePage(loader, label, isPage) {
  try {
    const value = await loader();
    if (isPage(value)) return value;
    // Tolerate fixtures that hand-roll a plain object with _page: true
    // (the dynamic-static-route validation test does this).
    if (value && value._page === true) return value;
    throw new Error("loader did not resolve to page({...}).");
  } catch (err) {
    throw new Error(`[mado:static] failed to load ${label}: ${err.message}`);
  }
}

function installNodeDomStubs() {
  if (globalThis.document && globalThis.customElements) return;

  globalThis.location = new URL("http://localhost/");
  globalThis.history = { pushState() {}, replaceState() {} };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: globalThis.location,
    history: globalThis.history,
  };
  globalThis.document = {
    adoptedStyleSheets: [],
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        setAttribute() {},
        appendChild() {},
        append() {},
        remove() {},
        style: {},
      };
    },
    head: { appendChild() {}, querySelectorAll: () => [] },
    body: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  globalThis.customElements = {
    define() {},
    get() {
      return undefined;
    },
    whenDefined() {
      return Promise.resolve();
    },
  };
  globalThis.HTMLElement = class {};
  globalThis.Element = class {};
  globalThis.Node = class {};
  globalThis.Comment = class {};
  globalThis.DocumentFragment = class {};
  globalThis.CSSStyleSheet = class {
    cssRules = [];
    replaceSync(text) {
      this.cssRules = text ? [{ cssText: String(text) }] : [];
    }
  };
  globalThis.CSS = { supports: () => false };
  globalThis.CSSRule = {};
  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
}

function pickDefaultEntry(projectRoot) {
  const appRoutes = "src/app.routes.ts";
  if (existsSync(resolve(projectRoot, appRoutes))) return appRoutes;
  return "src/routes.ts";
}

function toViteId(path) {
  return path.split("\\").join("/");
}
