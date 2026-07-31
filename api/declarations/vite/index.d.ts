import type { Plugin } from "vite";
export interface MadoVitePluginOptions {
    /**
     * Public origin used to build absolute URLs for static snapshots
     * (sitemap entries, canonical links, OpenGraph URLs).
     *
     *   mado({ site: "https://madojs.dev" })
     *
     * Combined with Vite's `base`, the canonical URL for a route is
     * `site + base + pathname`. Required when at least one page declares
     * `static`; snapshot capture stops with a targeted error when it is absent.
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
export declare function mado(options?: MadoVitePluginOptions): Plugin;
