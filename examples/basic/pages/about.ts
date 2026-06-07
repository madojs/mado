import { page, html, css, component } from "madojs";

component("x-about-card", () => () => html`
  <div class="card">
    <h2>About</h2>
    <p>
      <b>Mado</b> is a frontend framework that fits in one TypeScript project
      with zero runtime dependencies. Build with <code>tsc</code>, optional
      production bundle with <code>esbuild</code>.
    </p>
    <p>← <a href="/" data-link>home</a></p>
  </div>
`, {
  styles: css`
    :host { display: block; }
    .card { padding: 1rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
  `,
});

export default page({
  title: "About",
  view: () => html`<x-about-card></x-about-card>`,
});
