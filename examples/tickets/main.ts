/**
 * Entry point for the tickets example.
 * The app runs from / and relies only on browser ESM + the Mado importmap.
 */

import { html, render } from "@madojs/mado";
import routesApi from "./routes.js";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

render(html`${routesApi.view}`, root);
