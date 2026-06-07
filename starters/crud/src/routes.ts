import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "/tickets": () => import("./pages/tickets.js"),
  "/tickets/new": () => import("./pages/ticket-new.js"),
  "/tickets/:id": () => import("./pages/ticket-detail.js"),
  "*": () => import("./pages/not-found.js"),
});
