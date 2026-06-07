import { component, css, html } from "madojs";

component(
  "x-data-table",
  () => () => html`
    <div class="frame">
      <div class="toolbar"><slot name="toolbar"></slot></div>
      <div class="scroller"><slot></slot></div>
      <div class="footer"><slot name="footer"></slot></div>
    </div>
  `,
  {
    shadow: false,
    styles: css`
      x-data-table { display: block; }
      x-data-table .frame {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        overflow: hidden;
      }
      x-data-table .toolbar,
      x-data-table .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem;
        background: var(--bg-alt);
        border-bottom: 1px solid var(--border);
      }
      x-data-table .footer {
        border-top: 1px solid var(--border);
        border-bottom: 0;
      }
      x-data-table .scroller {
        overflow-x: auto;
      }
      x-data-table table {
        width: 100%;
        border-collapse: collapse;
      }
      x-data-table th,
      x-data-table td {
        padding: 0.7rem 0.75rem;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: middle;
      }
      x-data-table th {
        color: var(--fg-muted);
        font-size: 0.78rem;
        font-weight: 650;
        text-transform: uppercase;
      }
      x-data-table tbody tr:hover {
        background: color-mix(in srgb, var(--bg-alt) 72%, transparent);
      }
      x-data-table tbody tr:last-child td {
        border-bottom: 0;
      }
    `,
  },
);
