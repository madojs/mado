import { html, render } from "@madojs/mado";
import "./styles/global.js";
import "./components/app-shell.js";
import "./components/ticket-list.js";
import "./components/ticket-form.js";
import "./components/ticket-detail.js";
import router from "./routes.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

render(html`<app-shell>${router.view}</app-shell>`, app);
