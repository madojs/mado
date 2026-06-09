// Public landing page. `bake` is declared so that `mado bake` (and
// `mado release`) actually prerender a static HTML page out of the box.
// Without it the build output ships only the SPA shell — bots that hit
// "/" see an empty <body> instead of the welcome content.

import { html, page } from "@madojs/mado";

export default page({
  title: "__APP_NAME__",
  head: () => ({
    description: "A minimal Mado starter app.",
    og: {
      title: "__APP_NAME__",
      description: "A minimal Mado starter app.",
      type: "website",
    },
  }),
  bake: {
    paths: () => [{}],
    data: () => ({}),
  },
  view: () => html`
    <main class="shell">
      <section class="panel">
        <p class="eyebrow">Mado starter</p>
        <h1>__APP_NAME__</h1>
        <p>
          A tiny native-web app with browser ESM, Web Components, signals and
          tagged-template HTML.
        </p>
        <x-app-counter></x-app-counter>
      </section>
    </main>
  `,
});
