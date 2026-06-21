import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  publicDir: "public",
  build: {
    outDir: "out",
    assetsDir: "assets",
    target: "es2022",
  },
});
