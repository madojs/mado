// <x-button variant="primary|ghost|danger" ?disabled>
//
// Wraps a native <button> so it can be slotted with text/icon and styled
// consistently across the app. Click events bubble naturally because Shadow
// DOM is `mode: open` and composed: true is the default for `click`.

import { component, css, html } from "@madojs/mado";

component(
  "x-button",
  ({ host }) => () => {
    const variant = host.getAttribute("variant") ?? "primary";
    const disabled = host.hasAttribute("disabled");
    return html`
      <button data-variant=${variant} ?disabled=${disabled}>
        <slot></slot>
      </button>
    `;
  },
  {
    styles: css`
      :host { display: inline-flex; }
      button {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: 8px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        font: inherit;
        cursor: pointer;
        background: var(--accent);
        color: var(--accent-fg);
        transition: filter .12s ease;
      }
      button:hover:not(:disabled) { filter: brightness(1.07); }
      button:active:not(:disabled) { filter: brightness(.95); }
      button:disabled { opacity: .55; cursor: not-allowed; }

      button[data-variant="ghost"] {
        background: transparent;
        color: var(--fg);
        border-color: var(--border);
      }
      button[data-variant="ghost"]:hover:not(:disabled) {
        background: var(--bg-elevated);
      }

      button[data-variant="danger"] {
        background: var(--danger);
        color: white;
      }
    `,
  },
);