/**
 * Top navigation: marketing links + login/profile button.
 * Reacts to currentUser (signal), so the label changes after login.
 */

import { component, html, css, navigate } from "@madojs/mado";
import { currentUser, logout } from "../lib/auth.js";

component(
  "x-nav",
  ({ host, onDispose }) => {
    // Active route highlight: listen to popstate/history.
    // Simple approach: recalculate on click/popstate without extra signals.
    const updateActive = () => {
      const path = location.pathname;
      host.shadowRoot?.querySelectorAll("a[data-link]").forEach((a) => {
        const href = (a as HTMLAnchorElement).getAttribute("href")!;
        const isActive = href === "/" ? path === "/" : path.startsWith(href);
        a.classList.toggle("active", isActive);
      });
    };
    window.addEventListener("popstate", updateActive);
    // Delegate navbar clicks so we can react after navigate.
    const onClick = () => queueMicrotask(updateActive);
    document.addEventListener("click", onClick);
    onDispose(() => {
      window.removeEventListener("popstate", updateActive);
      document.removeEventListener("click", onClick);
    });

    // Initial highlight after mount.
    queueMicrotask(updateActive);

    const onLogout = async () => {
      await logout();
      navigate("/");
    };

    return () => html`
      <nav class="bar">
        <a href="/" data-link class="brand">Mado</a>
        <div class="links">
          <a href="/blog" data-link>Blog</a>
          <a href="/pricing" data-link>Pricing</a>
        </div>
        <div class="auth">
          ${() => {
            const u = currentUser();
            if (!u) {
              return html`<a href="/app/login" data-link class="btn">Login</a>`;
            }
            return html`
              <a href="/app/dashboard" data-link>CRM: ${u.name}</a>
              <button type="button" @click=${onLogout} class="muted">logout</button>
            `;
          }}
        </div>
      </nav>
    `;
  },
  {
    styles: css`
      :host {
        display: block;
        border-bottom: 1px solid var(--border);
        background: var(--bg);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .bar {
        max-width: 960px;
        margin: 0 auto;
        padding: 0.75rem 1rem;
        display: flex;
        align-items: center;
        gap: 1.5rem;
      }
      .brand {
        font-weight: 600;
        font-size: 1.1rem;
        color: var(--fg);
      }
      .links {
        display: flex;
        gap: 1rem;
        flex: 1;
      }
      .links a {
        color: var(--fg-muted);
      }
      .links a.active {
        color: var(--accent);
        font-weight: 500;
      }
      .auth {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .auth .muted {
        border: 0;
        background: transparent;
        color: var(--fg-muted);
        font-size: 0.85rem;
        cursor: pointer;
      }
      .btn {
        padding: 0.4rem 0.9rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
    `,
  },
);
