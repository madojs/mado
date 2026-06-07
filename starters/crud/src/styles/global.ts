import { css } from "@madojs/mado";

const sheet = css`
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --text: #172033;
    --muted: #64748b;
    --line: #d9dee8;
    --accent: #2563eb;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
    color: var(--text);
    background: var(--bg);
  }

  body {
    margin: 0;
  }

  .page {
    width: min(100% - 2rem, 72rem);
    margin: 0 auto;
    padding: 2rem 0;
  }

  .narrow {
    width: min(100% - 2rem, 42rem);
  }

  .hero,
  form,
  table,
  dl {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }

  .hero,
  form,
  dl {
    padding: 1.25rem;
  }

  h1 {
    margin: 0 0 0.5rem;
    letter-spacing: 0;
  }

  .eyebrow,
  p {
    color: var(--muted);
  }

  .toolbar,
  .filters,
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .filters {
    margin: 1rem 0;
  }

  input,
  select,
  textarea,
  button,
  .button {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font: inherit;
  }

  input,
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    background: white;
  }

  label {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 1rem;
    font-weight: 700;
  }

  small,
  .error {
    color: #dc2626;
  }

  button,
  .button {
    display: inline-flex;
    align-items: center;
    background: var(--accent);
    color: white;
    text-decoration: none;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
  }

  th,
  td {
    border-bottom: 1px solid var(--line);
    padding: 0.75rem;
    text-align: left;
  }

  .badge {
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    background: #e2e8f0;
    color: #334155;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .badge.open {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .badge.pending {
    background: #fef3c7;
    color: #92400e;
  }

  .badge.closed {
    background: #dcfce7;
    color: #166534;
  }
`;

document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
