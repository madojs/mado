// `feature-card` is a leaf component shared by the home page (in the
// static snapshot) and by `app.page.ts` (in the live SPA). The same
// open-shadow custom element runs in both contexts — that is the core
// promise of the universal model.
import { component, css, html } from "@madojs/mado";

component(
  "feature-card",
  (ctx) => {
    const title = ctx.attr("title", "");
    return () => html`
      <article class="card">
        <h3>${() => title()}</h3>
        <p><slot></slot></p>
      </article>
    `;
  },
  {
    styles: css`
      :host {
        display: block;
      }
      .card {
        padding: 1.25rem 1.5rem;
        border: 1px solid var(--mado-border);
        border-radius: var(--mado-radius);
        background: var(--mado-surface);
      }
      h3 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        font-weight: 600;
      }
      p {
        margin: 0;
        color: var(--mado-fg-muted);
      }
    `,
  },
);