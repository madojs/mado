/**
 * main.ts: showcase entry point.
 *
 *   1) apply the global stylesheet;
 *   2) load the initial session;
 *   3) mount <x-app> into #app, rendering <x-nav> + router.view.
 */

import { component, html, provide, render } from "madojs";
import route from "./routes.js";
import { globalStyles } from "./styles/global.js";
import { bootAuth } from "./lib/auth.js";
import { api } from "./lib/api.js";
import { ApiContext, ToastContext, createToastService } from "./lib/services.js";
import "./components/x-nav.js";
import "./components/x-toast-stack.js";

document.adoptedStyleSheets = [...document.adoptedStyleSheets, globalStyles];

// boot does not block render; the auth signal flips when it resolves.
void bootAuth();

component(
  "x-app",
  ({ host }) => {
    provide(host, ApiContext, api);
    provide(host, ToastContext, createToastService());

    return () => html`
      <x-nav></x-nav>
      <main>${route.view}</main>
      <x-toast-stack></x-toast-stack>
    `;
  },
  { shadow: false },
);

const root = document.querySelector("#app");
if (!root) throw new Error("#app not found");
render(html`<x-app></x-app>`, root);
