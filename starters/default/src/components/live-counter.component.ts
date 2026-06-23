// `live-counter` showcases reactivity: signal-driven text, a click
// handler that mutates the signal, and an open shadow root that
// participates in the static snapshot via Declarative Shadow DOM.
import { component, css, html, signal } from "@madojs/mado";

component(
  "live-counter",
  () => {
    const count = signal(0);
    return () => html`
      <div class="counter">
        <button
          class="bump"
          @click=${() => count.update((n) => n + 1)}
          aria-label="Increment"
        >
          +
        </button>
        <span class="value">${() => count()}</span>
      </div>
    `;
  },
  {
    styles: css`
      :host {
        display: inline-block;
      }
      .counter {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--mado-border);
        border-radius: var(--mado-radius);
        background: var(--mado-surface);
      }
      .bump {
        font: inherit;
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        border: 1px solid var(--mado-border);
        background: var(--mado-bg);
        cursor: pointer;
      }
      .bump:hover {
        background: var(--mado-surface-hover);
      }
      .value {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        min-width: 2ch;
        text-align: right;
      }
    `,
  },
);