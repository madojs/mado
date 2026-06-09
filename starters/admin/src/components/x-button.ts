// <x-button variant="primary|ghost|danger" ?disabled>
//
// Wraps a native <button> so it can be slotted with text/icon and styled
// consistently across the app.
//
// Handles two Shadow DOM gotchas out of the box:
//   1. Reactive attributes via ctx.attr() — external ?disabled changes
//      re-render the inner button automatically.
//   2. Form submit — a <button type="submit"> inside Shadow DOM cannot
//      trigger <form> submit in Light DOM (spec limitation). We call
//      form.requestSubmit() from a click handler to bridge this gap.

import { component, css, html } from "@madojs/mado";

component(
  "x-button",
  ({ host, attr }) => {
    const variant = attr("variant", "primary");
    const disabled = attr("disabled");

    const handleClick = () => {
      const typeAttr = host.getAttribute("type");
      if (typeAttr === "button" || typeAttr === "reset") return;
      const form = host.closest("form");
      if (form && !host.hasAttribute("disabled")) form.requestSubmit();
    };

    return () => html`
      <button
        data-variant=${variant()}
        ?disabled=${() => disabled() !== ""}
        @click=${handleClick}
      >
        <slot></slot>
      </button>
    `;
  },
  {
    styles: css`
      :host {
        display: inline-flex;
      }
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
        transition: filter 0.12s ease;
      }
      button:hover:not(:disabled) {
        filter: brightness(1.07);
      }
      button:active:not(:disabled) {
        filter: brightness(0.95);
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

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
