// Public landing page. Demonstrates that the marketing surface can live
// alongside the admin app without a guard, and can be baked for SEO.
//
// `bake` is declared so that `mado bake` (and `mado release`) actually
// prerender at least one static page out of the box. Without it the
// release output ships only the SPA shell with no SEO-friendly HTML
// for crawlers landing on "/".

import { html, page } from "@madojs/mado";

export default page({
  title: "Welcome",
  head: () => ({
    description: "An admin app scaffold built with Mado.",
    og: {
      title: "__APP_NAME__",
      description: "An admin app scaffold built with Mado.",
      type: "website",
    },
  }),
  bake: {
    paths: () => [{}],
    data: () => ({}),
  },
  view: () => html`
    <main style="max-width:720px;margin:0 auto;padding:64px 24px;">
      <h1>__APP_NAME__</h1>
      <p>This is the public landing page.</p>
      <p>
        <a href="/admin" data-link>Open the admin app →</a>
      </p>
    </main>
  `,
});
