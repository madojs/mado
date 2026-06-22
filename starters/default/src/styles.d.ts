// Allow CSS imports in TS modules. Vite handles the side-effect at
// build time; the runtime sees a no-op module.
declare module "*.css";