import { routes } from "@madojs/mado";

export const manifest = {
  "/": () => import("./pages/home.js"),
  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest);
