/**
 * Route manifest for the tickets zero-history validation example.
 */

import { routes } from "madojs";

export default routes(
  {
    "/": () => import("./pages/home.js"),
    "/tickets": () => import("./pages/tickets-list.js"),
    "/tickets/new": () => import("./pages/ticket-new.js"),
    "/tickets/:id": () => import("./pages/ticket-detail.js"),
    "*": () => import("./pages/not-found.js"),
  },
  { titleSuffix: " · Tickets" },
);
