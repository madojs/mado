// Global design tokens + a tiny utility layer for admin UIs.
//
// Tokens are CSS custom properties on :root so layouts and components can pick
// them up without a CSS preprocessor. Light/dark via prefers-color-scheme.
//
// Keep this file intentionally small. Components should style themselves with
// Shadow DOM. Light DOM utilities (.row, .stack, .card) are here only because
// they show up in every admin page and would be noisy to redefine per component.

const css = `
:root {
  color-scheme: light dark;

  --bg:           #ffffff;
  --bg-elevated:  #f7f8fa;
  --fg:           #0f172a;
  --fg-muted:     #475569;
  --border:       #e2e8f0;
  --accent:       #1f6feb;
  --accent-fg:    #ffffff;
  --danger:       #b91c1c;
  --success:      #15803d;

  --radius:       8px;
  --radius-sm:    6px;
  --space-1:      4px;
  --space-2:      8px;
  --space-3:      12px;
  --space-4:      16px;
  --space-5:      24px;
  --space-6:      32px;

  --font-sans:    ui-sans-serif, system-ui, -apple-system, "Segoe UI",
                  Roboto, Inter, Helvetica, Arial, sans-serif;

  --shadow-1:     0 1px 2px rgba(15, 23, 42, .05),
                  0 1px 1px rgba(15, 23, 42, .04);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          #0b1220;
    --bg-elevated: #111a2e;
    --fg:          #e6eefc;
    --fg-muted:    #9aa6bd;
    --border:      #1f2a44;
    --accent:      #3b82f6;
    --accent-fg:   #0b1220;
  }
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.row    { display: flex; align-items: center; gap: var(--space-3); }
.stack  { display: flex; flex-direction: column; gap: var(--space-3); }
.spacer { flex: 1; }

.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-5);
  box-shadow: var(--shadow-1);
}

.muted { color: var(--fg-muted); }
`;

if (typeof document !== "undefined" && !document.getElementById("admin-global-style")) {
  const tag = document.createElement("style");
  tag.id = "admin-global-style";
  tag.textContent = css;
  document.head.appendChild(tag);
}