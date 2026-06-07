import { html, render } from "@madojs/mado";
import "./styles/global.js";
import "./components/app-shell.js";
import router from "./routes.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

render(html`<x-app-shell>${router.view}</x-app-shell>`, app);
