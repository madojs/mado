import { html, page } from "@madojs/mado";

export default page({
  title: "Not found",
  view: () => html`
    <main class="shell">
      <section class="panel">
        <h1>Not found</h1>
        <p>The page does not exist.</p>
        <a href="/" data-link>Back home</a>
      </section>
    </main>
  `,
});
