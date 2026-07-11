// App-wide shell used by the authenticated zone (every module that lives
// behind requireAuth).
//
// A layout is a STRAIGHTFORWARD wrapper:
//   - it owns the chrome (header / nav / footer);
//   - it does NOT know which page is rendered inside (`child` is anonymous);
//   - it does NOT keep per-route state;
//   - it MAY read cross-cutting modules' public surfaces (auth, i18n…).
//
// Layouts live in src/layouts/ because they describe APP ZONES, not domains.

import { html, page, routeUrl } from "@madojs/mado";

import { isAuthed, logout, user } from "../modules/auth/auth.public";

export default page({
  title: "Mado App",
  // Every internal anchor uses `data-link` + `routeUrl()` so SPA
  // navigation intercepts the click and the href stays correct under
  // any Vite `base` (e.g. deploying the app under `/admin/`).
  view: ({ child }) => html`
    <div class="layout layout--app">
      <header class="app-header">
        <a data-link href=${routeUrl("/")} class="brand">Mado App</a>
        <nav>
          <a data-link href=${routeUrl("/billing/invoices")}>Invoices</a>
          ${() =>
            isAuthed()
              ? html`<span class="who">${() => user()?.email ?? ""}</span>
                  <button class="button button--ghost" type="button" @click=${logout}>Sign out</button>`
              : html`<a data-link href=${routeUrl("/login")}>Sign in</a>`}
        </nav>
      </header>
      <main class="app-main">${child}</main>
    </div>
  `,
});
