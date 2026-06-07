import { html, render } from "@madojs/mado";
import "./styles/global.js";
import router from "./routes.js";
import "./components/app-counter.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

render(html`${router.view}`, app);
