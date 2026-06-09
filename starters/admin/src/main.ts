// App entry point.
//
// The single job of main.ts is: mount the router into #app. Everything else
// (layouts, guards, pages, auth) is declared in routes.ts and the modules it
// imports. Do NOT wrap routes in a custom shell here — the shell is a `layout()`
// (see src/layouts/) so it can be different per route group.

import { html, render } from "@madojs/mado";
import "./styles/global.js";
import router from "./routes.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

render(html`${router.view}`, app);