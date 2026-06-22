// Single entrypoint: import the app routes and render them into the
// `#app` host declared in `index.html`. There is no separate "bootstrap"
// step — the router IS the application.
import { html, render } from "@madojs/mado";
import "./components/feature-card.component";
import "./components/live-counter.component";
import appRoutes from "./app.routes";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/document.css";

render(html`${appRoutes.view}`, document.getElementById("app")!);