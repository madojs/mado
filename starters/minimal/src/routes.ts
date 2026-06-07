import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "*": () => import("./pages/not-found.js"),
});
