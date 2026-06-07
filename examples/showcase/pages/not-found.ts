import { page, html } from "madojs";

export default page({
  title: "404",
  view: () => html`
    <section style="text-align:center; padding:4rem 1rem;">
      <h1 style="font-size:3rem; margin:0;">404</h1>
      <p style="color:var(--fg-muted);">That page does not exist.</p>
      <a href="/" data-link class="btn">Home</a>
    </section>
  `,
});
