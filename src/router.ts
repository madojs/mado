/**
 * Router module entry point. The implementation lives in `./router/`:
 *
 *   ./router/match.ts        — pure pattern matching (compile/flatten/normalize)
 *   ./router/navigation.ts   — router() + navigate() + queryParam (touches window/history)
 *   ./router/manifest.ts     — routes() + prefetchPath + lazy loading + sync-fast-path
 *
 * This file keeps compatibility for internal imports from `"./router.js"`.
 * The public barrel (`src/index.ts`) also goes through this file.
 */

export {
  router,
  navigate,
  queryParam,
  type RouterApi,
  type RouterOptions,
  type QueryParam,
  type QuerySignal,
} from "./router/navigation.js";

export type {
  RouteHandler,
  RouteParams,
  Routes,
  RoutesMap,
} from "./router/match.js";

export {
  routes,
  prefetchPath,
  type RoutesOptions,
} from "./router/manifest.js";
