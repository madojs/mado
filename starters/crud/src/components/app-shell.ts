import { component, css, html } from "@madojs/mado";

component(
  "app-shell",
  () => () => html`
    <header>
      <a class="brand" href="/" data-link>__APP_NAME__</a>
      <nav>
        <a href="/" data-link>Home</a>
        <a href="/tickets" data-link>Tickets</a>
        <a href="/tickets/new" data-link>New ticket</a>
      </nav>
    </header>
    <slot></slot>
  `,
  {
    shadow: false,
    styles: css`
      app-shell {
        min-height: 100vh;
        display: block;
      }

      app-shell header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border-bottom: 1px solid var(--line);
        background: white;
        padding: 0.9rem 1.25rem;
      }

      app-shell nav {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      app-shell a {
        color: #334155;
        text-decoration: none;
      }

      app-shell .brand {
        color: #111827;
        font-weight: 800;
      }
    `,
  },
);
