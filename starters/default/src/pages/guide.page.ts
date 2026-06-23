// Dynamic static page. `static.paths()` enumerates the slugs that
// the snapshot pipeline materialises at build time; `initialData()`
// seeds the rendered HTML so neither the snapshot nor the live boot
// has to re-fetch the guide body.
import { html, page, routeUrl } from "@madojs/mado";
import { findGuide, guides, type Guide } from "../content/guides";

type Params = { slug: string };

export default page<Params, Guide | null, Guide | null>({
  static: {
    paths: () => guides.map((g) => ({ slug: g.slug })),
    initialData: (params) => findGuide(params.slug) ?? null,
  },
  title: (params) => findGuide(params.slug)?.title ?? "Guide not found",
  head: (_params, seed) => {
    if (!seed) return { title: "Guide not found" };
    return { title: seed.title, description: seed.summary };
  },
  view: ({ data }) => {
    if (!data) {
      return html`
        <main class="document">
          <h1>Guide not found</h1>
          <p><a data-link href=${routeUrl("/")}>Back home</a></p>
        </main>
      `;
    }
    return html`
      <main class="document">
        <p><a data-link href=${routeUrl("/")}>← Home</a></p>
        <article>
          <h1>${data.title}</h1>
          <p class="lead">${data.summary}</p>
          <p>${data.body}</p>
        </article>
      </main>
    `;
  },
});