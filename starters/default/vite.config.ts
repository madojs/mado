import { defineConfig } from "vite";
import { mado } from "@madojs/mado/vite";

export default defineConfig({
  plugins: [
    mado({
      // Public origin used to build absolute URLs for static snapshots
      // (sitemap, canonical, OpenGraph). Combined with Vite's `base`,
      // the canonical for a route is `site + base + pathname`.
      //
      // REQUIRED when any page declares `static`. Set to your deployment
      // origin (e.g. https://your-app.example) before running
      // `mado release`. Override per environment via:
      //   mado release --base-url https://staging.example
      //   MADO_SITE=https://staging.example mado release
      // site: "https://your-app.example",
    }),
  ],
});
