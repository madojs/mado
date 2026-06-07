import { component, css, html } from "@madojs/mado";

component(
  "x-empty-state",
  () => () => html`
    <section class="empty">
      <strong><slot name="title">Nothing here</slot></strong>
      <p><slot></slot></p>
      <div class="actions"><slot name="action"></slot></div>
    </section>
  `,
  {
    styles: css`
      :host { display: block; }
      .empty {
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        background: var(--bg-alt);
        padding: 1.25rem;
        text-align: center;
      }
      strong {
        display: block;
        color: var(--fg);
        margin-bottom: 0.25rem;
      }
      p {
        margin: 0 auto;
        color: var(--fg-muted);
        max-width: 34rem;
      }
      .actions {
        margin-top: 0.85rem;
      }
    `,
  },
);
