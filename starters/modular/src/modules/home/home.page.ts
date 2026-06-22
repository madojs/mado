// Canonical *.page.ts shape:
//   1. LOCAL STATE       — per-view signals owned by this page
//   2. DATA              — resources from this module's *.resource.ts
//   3. ACTIONS           — event handlers, mutations
//   4. VIEW              — default export via page({...})
//
// A page should be read top-to-bottom and understood without jumping files.

import { html, page } from "@madojs/mado";

// 1. LOCAL STATE — none
// 2. DATA       — none
// 3. ACTIONS    — none

// 4. VIEW
export default page({
  static: true,
  title: "Home",
  head: () => ({
    description: "A modular Mado application.",
  }),
  view: () => html`
    <section>
      <h1>Mado App</h1>
      <p>
        Welcome. Try <a href="/billing/invoices">billing</a> or
        <a href="/login">sign in</a>.
      </p>
    </section>
  `,
});
