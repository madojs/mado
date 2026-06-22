import { html, page } from "@madojs/mado";

export default page({
  title: "Not Found",
  view: () => html`
    <section>
      <h1>404</h1>
      <p>This route does not exist. <a href="/">Go home</a>.</p>
    </section>
  `,
});