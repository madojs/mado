/**
 * Global CSSStyleSheet applied through adoptedStyleSheets.
 * Contains design tokens and base layout classes.
 */

import { css } from "@madojs/mado";

export const globalStyles = css`
  :root {
    --bg: #ffffff;
    --bg-alt: #f8fafc;
    --fg: #172033;
    --fg-muted: #667085;
    --border: #d8dee8;
    --accent: #2563eb;
    --danger: #b91c1c;
    --radius: 8px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }
  a:hover { text-decoration: underline; }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .page-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .page-head h1 {
    margin: 0 0 0.25rem;
    font-size: 1.45rem;
  }
  .page-head p {
    margin: 0;
    color: var(--fg-muted);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    text-decoration: none;
    font-size: 0.9rem;
    font: inherit;
    cursor: pointer;
  }
  .btn:hover { background: var(--bg-alt); text-decoration: none; }
  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .btn-primary:hover { background: #1d4ed8; color: white; }
  .btn-danger {
    color: var(--danger);
    border-color: #fecaca;
  }
  .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

  .muted { color: var(--fg-muted); }
  .err { color: var(--danger); }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    background: var(--bg-alt);
    color: var(--fg-muted);
  }
  .badge-accent { background: var(--accent); color: white; }

  .route-loading,
  .route-error {
    margin: 2rem auto;
    max-width: 720px;
    padding: 1rem;
    color: var(--fg-muted);
  }
  .route-error {
    color: var(--danger);
    border: 1px solid #fecaca;
    border-radius: var(--radius);
    background: #fff7f7;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }
  .form-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .form-row.full { grid-column: 1 / -1; }
  .form-row label,
  label.form-row {
    color: var(--fg-muted);
    font-size: 0.86rem;
    font-weight: 600;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: 2.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    padding: 0.5rem 0.65rem;
  }
  textarea {
    min-height: 6rem;
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 36%, transparent);
    border-color: var(--accent);
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  @media (max-width: 760px) {
    .page-head,
    .form-grid,
    .metric-grid {
      grid-template-columns: 1fr;
    }
    .page-head {
      display: grid;
    }
  }
`;
