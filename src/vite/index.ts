import { resolve } from "node:path";

import type { Plugin, UserConfig } from "vite";

export interface MadoVitePluginOptions {}

/**
 * Vite integration for Mado apps.
 *
 * The plugin is intentionally small: Vite owns dev serving, HTML processing,
 * assets and bundling; Mado keeps its runtime and static snapshot semantics.
 */
export function mado(_options: MadoVitePluginOptions = {}): Plugin {
  let root = process.cwd();

  return {
    name: "mado",
    config(userConfig): UserConfig {
      root = resolve(process.cwd(), userConfig.root ?? ".");

      return {
        appType: "spa",
        publicDir: "public",
        build: {
          outDir: "out",
          assetsDir: "assets",
          target: "es2022",
        },
      };
    },
    handleHotUpdate(ctx) {
      if (/\.(ts|js)$/.test(ctx.file)) {
        ctx.server.ws.send({ type: "full-reload" });
        return [];
      }
      return undefined;
    },
  };
}
