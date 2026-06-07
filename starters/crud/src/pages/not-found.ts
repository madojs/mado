import { html, page } from "@madojs/mado";

export default page({
  title: "Not found",
  view: () => html`
    <section class="page">
      <h1>Not found</h1>
      <p>The page does not exist.</p>
      <a href="/" data-link>Back home</a>
    </section>
  `,
});
