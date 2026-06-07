import { component, css, each, html, inject } from "@madojs/mado";
import { ToastContext } from "../lib/services.js";

component(
  "x-toast-stack",
  ({ host }) => {
    const toastService = inject(host, ToastContext);
    return () => html`
      <div class="stack" aria-live="polite">
        ${() =>
          each(
            toastService().toasts(),
            (toast) => toast.id,
            (toast) => html`
              <button
                class=${`toast tone-${toast.tone}`}
                type="button"
                @click=${() => toastService().remove(toast.id)}
              >
                ${toast.message}
              </button>
            `,
          )}
      </div>
    `;
  },
  {
    styles: css`
      :host {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 70;
      }
      .stack {
        display: grid;
        gap: 0.5rem;
        width: min(360px, calc(100vw - 2rem));
      }
      .toast {
        text-align: left;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--fg);
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.14);
        padding: 0.75rem 0.85rem;
        font: inherit;
        cursor: pointer;
      }
      .toast.tone-success { border-color: #bbf7d0; }
      .toast.tone-error { border-color: #fecaca; }
      .toast.tone-info { border-color: #bae6fd; }
    `,
  },
);
