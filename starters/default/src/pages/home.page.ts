// Public landing page. `static: true` opts the route into the
// browser-rendered snapshot pipeline — `mado release` captures this
// view into `out/index.html` with the rendered Shadow DOM inlined.
import { html, page, routeUrl } from "@madojs/mado";
import { guides } from "../content/guides";

export default page({
  static: true,
  title: "Mado — a calm native-first web framework",
  head: () => ({
    description:
      "Build with real Web Components, signals, routing, data and forms. " +
      "Ship live SPAs and browser-rendered static documents from one " +
      "component model.",
  }),
  view: () => html`
    <main class="document">
      <header class="hero">
        <h1>Mado</h1>
        <p class="lead">
          A calm native-first web framework for sites and apps.
        </p>
        <p>
          <strong>One component model. One page model. One release command.</strong>
        </p>
      </header>

      <section class="features">
        ${guides.map(
          (guide) => html`
            <feature-card title=${guide.title}>
              ${guide.summary}
              <a data-link href=${routeUrl(`/guide/${guide.slug}`)}>
                Read the guide →
              </a>
            </feature-card>
          `,
        )}
      </section>

      <section class="cta">
        <h2>Open the app</h2>
        <p>
          <a data-link href=${routeUrl("/app")}>Launch the live SPA →</a>
        </p>
      </section>
    </main>
  `,
});