// App entry point. The ONLY file allowed to import CSS at runtime.
import "./shared/styles/tokens.css";
import "./shared/styles/reset.css";
import "./shared/styles/app.css";

import { html, render } from "@madojs/mado";

import { init as initAuth } from "./modules/auth/auth.service";
import appRoutes from "./app.routes";

// One-off boot order: init cross-cutting modules first, then render the
// router view into #app.
await initAuth();

render(html`${appRoutes.view}`, document.getElementById("app")!);