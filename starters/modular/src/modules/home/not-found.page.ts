import { html, page, routeUrl } from "@madojs/mado";

export default page({
  title: "Not Found",
  view: () => html`
    <section>
      <h1>404</h1>
      <p>
        This route does not exist.
        <a data-link href=${routeUrl("/")}>Go home</a>.
      </p>
    </section>
  `,
});