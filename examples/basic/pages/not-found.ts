import { page, html } from "madojs";

export default page({
  title: "404",
  view: ({ path }) => html`
    <div>
      <h2>404</h2>
      <p>Page <code>${path}</code> was not found.</p>
      <a href="/" data-link>← home</a>
    </div>
  `,
});
