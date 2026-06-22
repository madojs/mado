import { component, css, html } from "@madojs/mado";

component("x-spinner", () => () => html`<div class="dot" aria-label="Loading"></div>`, {
  styles: css`
    :host {
      display: inline-block;
    }
    .dot {
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
});