/**
 * Settings page: local signals, context toast service and plain form controls.
 */

import { component, computed, css, html, inject, page, signal } from "@madojs/mado";
import { ToastContext } from "../lib/services.js";

component(
  "x-settings",
  ({ host }) => {
    const toasts = inject(host, ToastContext);
    const density = signal<"comfortable" | "compact">("comfortable");
    const accent = signal("blue");
    const summary = computed(() => `${density()} density · ${accent()} accent`);

    const onDensity = (e: Event) => {
      density.set((e.target as HTMLSelectElement).value as "comfortable" | "compact");
    };
    const onAccent = (e: Event) => accent.set((e.target as HTMLSelectElement).value);
    const save = () => toasts().push("success", `Saved ${summary()}`);

    return () => html`
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p>Small local state screen proving not every setting needs a store.</p>
        </div>
      </header>

      <section class="card">
        <div class="form-grid">
          <label class="form-row">
            Density
            <select .value=${density} @change=${onDensity}>
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>
          <label class="form-row">
            Accent
            <select .value=${accent} @change=${onAccent}>
              <option value="blue">blue</option>
              <option value="green">green</option>
              <option value="violet">violet</option>
            </select>
          </label>
        </div>
        <p class="muted">Preview: ${summary}</p>
        <button class="btn btn-primary" type="button" @click=${save}>Save settings</button>
      </section>
    `;
  },
  {
    shadow: false,
    styles: css`
      x-settings { display: block; max-width: 680px; }
      .card {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        padding: 1rem;
      }
    `,
  },
);

export default page({
  title: "Settings",
  view: () => html`<x-settings></x-settings>`,
});
