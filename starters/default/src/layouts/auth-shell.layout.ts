// Centered card shell used by the AUTH zone (login, forgot, reset…).
//
// Note this layout is NOT owned by the auth module — it's owned by the
// auth ZONE. If tomorrow a `password-reset` module appears, it will reuse
// this same shell.

import { html, page } from "@madojs/mado";

export default page({
  title: "Sign in",
  view: ({ child }) => html`
    <div class="layout layout--auth">
      <a href="/" class="brand">Mado App</a>
      <main class="auth-main">${child}</main>
    </div>
  `,
});