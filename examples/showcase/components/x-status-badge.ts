import { component, css, html } from "@madojs/mado";

component(
  "x-status-badge",
  ({ host }) => {
    const tone = () => host.getAttribute("tone") ?? "neutral";
    return () => html`<span class=${() => `badge tone-${tone()}`}><slot></slot></span>`;
  },
  {
    styles: css`
      :host { display: inline-block; }
      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 1.5rem;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 650;
        line-height: 1;
        text-transform: capitalize;
        border: 1px solid transparent;
      }
      .tone-active,
      .tone-won {
        background: #dcfce7;
        color: #166534;
        border-color: #bbf7d0;
      }
      .tone-lead,
      .tone-new,
      .tone-qualified {
        background: #e0f2fe;
        color: #075985;
        border-color: #bae6fd;
      }
      .tone-at-risk,
      .tone-high,
      .tone-proposal {
        background: #fef3c7;
        color: #92400e;
        border-color: #fde68a;
      }
      .tone-churned,
      .tone-lost {
        background: #fee2e2;
        color: #991b1b;
        border-color: #fecaca;
      }
      .tone-enterprise,
      .tone-admin {
        background: #eef2ff;
        color: #3730a3;
        border-color: #c7d2fe;
      }
      .tone-normal,
      .tone-growth,
      .tone-user,
      .tone-neutral {
        background: var(--bg-alt);
        color: var(--fg-muted);
        border-color: var(--border);
      }
    `,
  },
);
