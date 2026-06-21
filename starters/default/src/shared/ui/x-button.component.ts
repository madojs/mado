// Reusable UI brick. Pure presentation: no business state, no signals
// reaching out to services. Token-driven look, themable via tokens.css.
//
// Reactive attributes via ctx.attr(name, default?) — no MutationObserver
// boilerplate.

import { component, css, html } from "@madojs/mado";

component(
  "x-button",
  ({ attr }) => {
    const variant = attr("variant", "primary"); // "primary" | "ghost"
    const disabled = attr("disabled", "false");
    return () => html`
      <button
        class=${() => `btn btn--${variant()}`}
        ?disabled=${() => disabled() !== "false"}
      >
        <slot></slot>
      </button>
    `;
  },
  {
    styles: css`
      :host {
        display: inline-block;
      }
      .btn {
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-md);
        border: 1px solid transparent;
        cursor: pointer;
      }
      .btn--primary {
        background: var(--color-primary);
        color: var(--color-primary-contrast);
      }
      .btn--ghost {
        background: transparent;
        border-color: var(--color-border);
        color: var(--color-text);
      }
      .btn[disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `,
  },
);
