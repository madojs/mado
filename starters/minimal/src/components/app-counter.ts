import { component, css, html, signal } from "@madojs/mado";

component(
  "app-counter",
  () => {
    const count = signal(0);
    return () => html`
      <button @click=${() => count.update((n) => n + 1)}>
        Count: ${count}
      </button>
    `;
  },
  {
    styles: css`
      :host {
        display: inline-block;
        margin-top: 1rem;
      }

      button {
        border: 1px solid #1f2937;
        border-radius: 6px;
        background: #111827;
        color: white;
        padding: 0.65rem 0.9rem;
        font: inherit;
        cursor: pointer;
      }
    `,
  },
);
