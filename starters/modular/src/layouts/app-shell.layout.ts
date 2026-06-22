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

import { html, page } from "@madojs/mado";

import { isAuthed, logout, user } from "../modules/auth/auth.public";
import "../shared/ui/x-button.component";

export default page({
  title: "Mado App",
  view: ({ child }) => html`
    <div class="layout layout--app">
      <header class="app-header">
        <a href="/" class="brand">Mado App</a>
        <nav>
          <a href="/billing/invoices">Invoices</a>
          ${() =>
            isAuthed()
              ? html`<span class="who">${() => user()?.email ?? ""}</span>
                  <x-button variant="ghost" @click=${logout}>Sign out</x-button>`
              : html`<a href="/login">Sign in</a>`}
        </nav>
      </header>
      <main class="app-main">${child}</main>
    </div>
  `,
});