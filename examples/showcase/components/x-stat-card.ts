/**
 * Simple stat card: dot icon + label + large number.
 * Used on the dashboard. Shadow DOM is fine here because it is a leaf visual.
 */

import { component, html, css } from "@madojs/mado";

component(
  "x-stat-card",
  ({ host }) => {
    return () => html`
      <div class="card">
        <div class="label"><slot name="label"></slot></div>
        <div class="value"><slot></slot></div>
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .card {
        padding: 1rem 1.25rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
      }
      .label {
        color: var(--fg-muted);
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
      }
      .value {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1;
      }
    `,
  },
);
