// Catch-all 404. Not statically captured; the SPA shell serves it
// whenever a deep link does not match a known route.
import { html, page, routeUrl } from "@madojs/mado";

export default page({
  title: "Page not found",
  head: () => ({
    description: "The page you are looking for does not exist.",
    meta: [{ name: "robots", content: "noindex" }],
  }),
  view: ({ path }) => html`
    <main class="document">
      <h1>404</h1>
      <p>No page is registered for <code>${() => path()}</code>.</p>
      <p><a data-link href=${routeUrl("/")}>Back home</a></p>
    </main>
  `,
});