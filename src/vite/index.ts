import type { Plugin, ResolvedConfig } from "vite";

export interface MadoVitePluginOptions {
  /**
   * Public origin used to build absolute URLs for static snapshots
   * (sitemap entries, canonical links, OpenGraph URLs).
   *
   *   mado({ site: "https://madojs.dev" })
   *
   * Combined with Vite's `base`, the canonical URL for a route is
   * `site + base + pathname`. Required when at least one page declares
   * `static`; otherwise the build emits absolute URLs that point
   * nowhere.
   */
  site?: string;
}

/**
 * Vite integration for Mado apps.
 *
 * Intentionally minimal: Vite owns dev serving, HTML processing, assets
 * and bundling. This plugin is the bridge that hands the snapshot CLI the
 * three pieces of resolved Vite config it needs and asks Vite for a
 * Mado-flavoured full reload on TypeScript/JavaScript changes.
 *
 * What it owns:
 *   1. a small `build.target` default (matches what the runtime relies on);
 *   2. forcing a full page reload when a `.ts` / `.js` module updates,
 *      so signals / components do not have to track HMR state;
 *   3. emitting `_mado/build.json` into the output so
 *      `scripts/static.mjs` can read the resolved Vite `base`, `assetsDir`
 *      and the user-declared `site` without parsing `vite.config.ts`.
 *
 * What it does NOT own:
 *   - HTML ownership (Vite keeps that),
 *   - publicDir / outDir / assetsDir defaults (Vite already supplies them),
 *   - snapshot orchestration (CLI keeps that),
 *   - SSR or hydration.
 */
export function mado(options: MadoVitePluginOptions = {}): Plugin {
  let resolved: ResolvedConfig | null = null;

  return {
    name: "mado",

    config() {
      return {
        build: { target: "es2022" },
      };
    },

    configResolved(config) {
      resolved = config;
    },

    handleHotUpdate(ctx) {
      if (!/\.[cm]?[jt]s$/.test(ctx.file)) return;
      // Invalidate the module graph first; otherwise the reload would
      // serve cached modules and miss the change. Mirrors the canonical
      // Vite "force full reload" recipe.
      const invalidated = new Set<unknown>();
      for (const mod of ctx.modules) {
        ctx.server.moduleGraph.invalidateModule(
          mod,
          invalidated as Set<never>,
          ctx.timestamp,
          true,
        );
      }
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    },

    generateBundle() {
      if (!resolved) return;
      this.emitFile({
        type: "asset",
        fileName: "_mado/build.json",
        source: JSON.stringify({
          site: options.site ?? null,
          base: resolved.base,
          assetsDir: resolved.build.assetsDir,
          outDir: resolved.build.outDir,
        }),
      });
    },
  };
}
