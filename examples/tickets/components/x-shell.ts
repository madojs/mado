/**
 * Shell layout for the tickets example.
 * Shadow DOM keeps the app frame stable while page components style their content.
 */

import { component, html, css } from "@madojs/mado";

component(
  "x-ticket-shell",
  () => () => html`
    <div class="frame">
      <aside>
        <a class="brand" href="/" data-link>
          <span class="mark" aria-hidden="true">T</span>
          <span>
            <strong>Tickets</strong>
            <small>Operations desk</small>
          </span>
        </a>
        <nav aria-label="Primary">
          <a href="/" data-link>Overview</a>
          <a href="/tickets" data-link>Tickets</a>
          <a href="/tickets/new" data-link>New ticket</a>
        </nav>
      </aside>
      <div class="workspace">
        <header>
          <div>
            <p>Mado validation</p>
            <h1>Ticket admin</h1>
          </div>
          <a class="primary" href="/tickets/new" data-link>New ticket</a>
        </header>
        <main>
          <slot></slot>
        </main>
      </div>
    </div>
  `,
  {
    styles: css`
      :host {
        display: block;
        min-height: 100vh;
        color: var(--fg);
      }
      .frame {
        display: grid;
        grid-template-columns: 15rem minmax(0, 1fr);
        min-height: 100vh;
      }
      aside {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        padding: 1rem;
        border-right: 1px solid var(--border);
        background: #ffffff;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: .75rem;
        color: var(--fg);
        text-decoration: none;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: var(--radius);
        background: var(--accent);
        color: white;
        font-weight: 800;
      }
      .brand span:last-child {
        display: grid;
        gap: .05rem;
      }
      .brand small {
        color: var(--fg-muted);
        font-size: .78rem;
      }
      nav {
        display: grid;
        gap: .25rem;
      }
      nav a {
        padding: .55rem .65rem;
        border-radius: var(--radius);
        color: var(--fg-muted);
        font-weight: 650;
        text-decoration: none;
      }
      nav a:hover {
        background: var(--panel-soft);
        color: var(--fg);
      }
      .workspace {
        min-width: 0;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 4.75rem;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border);
        background: rgba(255, 255, 255, .86);
        backdrop-filter: blur(12px);
      }
      header p {
        margin: 0;
        color: var(--fg-muted);
        font-size: .78rem;
        font-weight: 700;
        text-transform: uppercase;
      }
      header h1 {
        margin: .1rem 0 0;
        font-size: 1.25rem;
      }
      .primary {
        display: inline-flex;
        align-items: center;
        min-height: 2.35rem;
        padding: 0 .85rem;
        border-radius: var(--radius);
        background: var(--accent);
        color: white;
        font-weight: 700;
        text-decoration: none;
      }
      main {
        width: min(1120px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 1.5rem 0 2.5rem;
      }
      a {
        color: var(--accent);
      }
      @media (max-width: 780px) {
        .frame {
          grid-template-columns: 1fr;
        }
        aside {
          position: static;
          border-right: 0;
          border-bottom: 1px solid var(--border);
        }
        nav {
          grid-template-columns: repeat(3, max-content);
          overflow-x: auto;
        }
        header {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `,
  },
);
