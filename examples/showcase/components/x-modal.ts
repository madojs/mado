import { component, css, html } from "@madojs/mado";

component(
  "x-modal",
  () => () => html`
    <div class="backdrop">
      <section class="dialog" role="dialog" aria-modal="true">
        <header><slot name="title"></slot></header>
        <div class="body"><slot></slot></div>
        <footer><slot name="actions"></slot></footer>
      </section>
    </div>
  `,
  {
    styles: css`
      :host { position: fixed; inset: 0; z-index: 60; }
      .backdrop {
        min-height: 100%;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: rgba(15, 23, 42, 0.36);
      }
      .dialog {
        width: min(520px, 100%);
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--bg);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
      }
      header, footer {
        padding: 0.9rem 1rem;
        border-bottom: 1px solid var(--border);
      }
      footer {
        border-top: 1px solid var(--border);
        border-bottom: 0;
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .body { padding: 1rem; }
    `,
  },
);
