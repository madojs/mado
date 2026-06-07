/**
 * <x-counter>: counter. Demonstrates signal/computed/batch.
 *
 * Component registration is a side effect of importing this file.
 * Convention: one file = one component = one registration.
 */

import { component, html, css, signal, computed, batch } from "@madojs/mado";

component(
  "x-counter",
  () => {
    const count = signal(0);
    const doubled = computed(() => count() * 2);

    const bumpFive = () => {
      batch(() => {
        for (let i = 0; i < 5; i++) count.update((n) => n + 1);
      });
    };

    return () => html`
      <div class="card">
        <h2>Counter</h2>
        <p>Value: <b>${count}</b> · Doubled: <b>${doubled}</b></p>
        <button @click=${() => count.update((n) => n + 1)}>+1</button>
        <button @click=${() => count.update((n) => n - 1)}>-1</button>
        <button @click=${bumpFive}>+5 (batched)</button>
        <button @click=${() => count.set(0)}>reset</button>
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .card { padding: 1rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
      button { margin-right: .5rem; }
    `,
  },
);
