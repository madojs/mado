// Public landing page. `bake` is declared so that `mado bake` (and
// `mado release`) actually prerender at least one SEO-friendly HTML page
// out of the box. Without it the build output ships only the SPA shell.

import { html, page } from "@madojs/mado";

export default page({
  title: "__APP_NAME__",
  head: () => ({
    description: "A CRUD scaffold built with Mado.",
    og: {
      title: "__APP_NAME__",
      description: "A CRUD scaffold built with Mado.",
      type: "website",
    },
  }),
  bake: {
    paths: () => [{}],
    data: () => ({}),
  },
  view: () => html`
    <section class="page">
      <div class="hero">
        <p class="eyebrow">Mado CRUD starter</p>
        <h1>Small admin apps without frontend ceremony.</h1>
        <p>
          This starter shows routes, resources, mutations, forms, query params
          and keyed lists in a compact ticket admin.
        </p>
        <a class="button" href="/tickets" data-link>Open tickets</a>
      </div>
    </section>
  `,
});
