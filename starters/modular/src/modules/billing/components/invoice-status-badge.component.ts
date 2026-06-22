// Module-local UI brick. Reactive attribute via ctx.attr().
//
// If another module ever needs this badge, MOVE the file to shared/ui/.
// Don't import across modules.

import { component, css, html } from "@madojs/mado";

component(
  "invoice-status-badge",
  ({ attr }) => {
    const status = attr("status", "pending");
    return () => html`
      <span class=${() => `badge badge--${status()}`}>${status}</span>
    `;
  },
  {
    styles: css`
      .badge {
        display: inline-block;
        padding: 0 var(--space-2);
        border-radius: var(--radius-sm);
        font-size: 0.85em;
        line-height: 1.6;
      }
      .badge--paid {
        background: color-mix(in srgb, var(--color-success) 18%, transparent);
        color: var(--color-success);
      }
      .badge--pending {
        background: color-mix(in srgb, var(--color-text-muted) 18%, transparent);
        color: var(--color-text-muted);
      }
      .badge--void {
        background: color-mix(in srgb, var(--color-danger) 18%, transparent);
        color: var(--color-danger);
      }
      .badge--draft {
        background: color-mix(in srgb, var(--color-border) 60%, transparent);
        color: var(--color-text);
      }
    `,
  },
);