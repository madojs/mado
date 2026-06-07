/**
 * Dashboard metric tile with named slots.
 */

import { component, css, html } from "madojs";

component(
  "x-ticket-metric",
  () => () => html`
    <div class="marker" aria-hidden="true"></div>
    <div class="content">
      <span class="label"><slot name="label"></slot></span>
      <strong><slot name="value"></slot></strong>
      <span class="hint"><slot name="hint"></slot></span>
    </div>
  `,
  {
    styles: css`
      :host {
        display: grid;
        grid-template-columns: .35rem 1fr;
        min-width: 0;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--panel);
      }
      .marker {
        background: var(--metric, var(--accent));
      }
      .content {
        display: grid;
        gap: .25rem;
        padding: .9rem 1rem;
      }
      .label, .hint {
        color: var(--fg-muted);
        font-size: .82rem;
      }
      strong {
        color: var(--fg);
        font-size: 1.6rem;
        line-height: 1;
      }
      :host([tone="open"]) { --metric: #12b76a; }
      :host([tone="pending"]) { --metric: #f79009; }
      :host([tone="closed"]) { --metric: #98a2b3; }
      :host([tone="high"]) { --metric: #e31b54; }
    `,
  },
);
