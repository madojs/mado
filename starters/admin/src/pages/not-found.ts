import { html, page } from "@madojs/mado";

export default page({
  title: "Not found",
  view: () => html`
    <main style="max-width:560px;margin:0 auto;padding:80px 24px;text-align:center;">
      <h1 style="margin:0 0 12px;">404</h1>
      <p class="muted">This page does not exist.</p>
      <p><a href="/" data-link>← Back home</a></p>
    </main>
  `,
});