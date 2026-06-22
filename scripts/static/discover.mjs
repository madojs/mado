import { existsSync, writeSync } from "node:fs";
import { resolve } from "node:path";

import { detectContext, resolveProjectPath } from "../_config.mjs";
import { assertJsonSerializable } from "./serialize.mjs";

export async function discoverStaticRoutes(options) {
  const projectRoot = resolve(options.projectRoot);
  const context = detectContext(projectRoot);
  const entry = resolveProjectPath(projectRoot, options.entry ?? pickDefaultEntry(projectRoot));

  if (!existsSync(entry)) {
    fatal(
      `[mado:static] entry not found: ${entry}`,
      `[mado:static] expected src/app.routes.ts or src/routes.ts; pass --entry <file> to override`,
    );
  }

  installNodeDomStubs();

  let createViteServer;
  try {
    ({ createServer: createViteServer } = await import("vite"));
  } catch {
    fatal(
      "[mado:static] package 'vite' is required.",
      "[mado:static] Install it as a dev dependency in this project:",
      "[mado:static]   npm i -D vite playwright-core",
    );
  }

  const aliases =
    context === "repo"
      ? { "@madojs/mado": resolve(projectRoot, "src/index.ts") }
      : {};

  const viteServer = await createViteServer({
    root: projectRoot,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
    resolve: { alias: aliases },
  });

  try {
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
      const page = await resolvePage(flat.loader, pattern);
      if (!page?.static) continue;

      validateStaticRoute(pattern, flat, page);
      for (const layoutLoader of flat.layouts) {
        const layout = await resolvePage(layoutLoader, `${pattern} layout`);
        if (layout?.guard) {
          throw new Error(`[mado:static] ${pattern}: static routes cannot use guarded layouts.`);
        }
      }

      const config = page.static === true ? {} : page.static;
      const paramsList = await resolveParams(pattern, config);
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

function validateStaticRoute(pattern, flat, page) {
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

async function resolveParams(pattern, config) {
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

async function resolvePage(loader, label) {
  try {
    const value = await loader();
    if (value?._page === true) return value;
    throw new Error("loader did not resolve to page({...}).");
  } catch (err) {
    throw new Error(`[mado:static] failed to load ${label}: ${err.message}`);
  }
}

function flatten(map, prefix = "", layouts = [], guards = []) {
  const out = [];
  for (const [key, value] of Object.entries(map)) {
    const full = joinRoute(prefix, key);
    if (isLayoutGroup(value)) {
      const nextLayouts = value.layout ? [...layouts, normalize(value.layout)] : layouts;
      const nextGuards = value.guard ? [...guards, ...toGuardArray(value.guard)] : guards;
      out.push(...flatten(value.routes, full, nextLayouts, nextGuards));
    } else {
      out.push([
        full || "/",
        {
          loader: normalize(value),
          layouts,
          guards: [...guards],
        },
      ]);
    }
  }
  return out;
}

function normalize(entry) {
  if (entry?._page === true) return () => entry;
  if (typeof entry === "function") {
    return async () => {
      const mod = await entry();
      return mod?.default;
    };
  }
  throw new Error("[mado:static] invalid route entry in manifest.");
}

function isLayoutGroup(value) {
  return Boolean(value && typeof value === "object" && value._layout === true);
}

function toGuardArray(guard) {
  return Array.isArray(guard) ? guard : [guard];
}

function joinRoute(a, b) {
  if (!a) return b;
  if (!b) return a;
  const left = a.endsWith("/") ? a.slice(0, -1) : a;
  const right = b.startsWith("/") ? b.slice(1) : b;
  return `${left}/${right}`;
}

function paramKeys(pattern) {
  const keys = [];
  pattern.replace(/:([\w]+)/g, (_m, key) => {
    keys.push(key);
    return "";
  });
  return keys;
}

function applyParams(pattern, params) {
  if (pattern === "/") return "/";
  const pathname = pattern.replace(/:([\w]+)/g, (_m, key) => {
    const value = params[key];
    if (value == null) {
      throw new Error(`[mado:static] missing param :${key} for ${pattern}`);
    }
    return encodeURIComponent(String(value));
  });
  if (pathname.includes("?") || pathname.includes("#")) {
    throw new Error(`[mado:static] ${pattern}: query strings and hashes are not static paths.`);
  }
  const absolute = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return absolute.length > 1 && absolute.endsWith("/") ? absolute.slice(0, -1) : absolute;
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

function fatal(...msgs) {
  writeSync(2, msgs.join("\n") + "\n");
  process.exit(1);
}
