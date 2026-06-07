/**
 * <x-todos>: keyed list rendering.
 */

import {
  component,
  html,
  css,
  signal,
  computed,
  batch,
  each,
} from "madojs";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

component(
  "x-todos",
  () => {
    const items = signal<Todo[]>([
      { id: 1, text: "Remove webpack", done: true },
      { id: 2, text: "Delete node_modules", done: false },
      { id: 3, text: "Write tests", done: false },
    ]);
    const draft = signal("");

    const remaining = computed(() => items().filter((t) => !t.done).length);

    const add = () => {
      const text = draft().trim();
      if (!text) return;
      batch(() => {
        items.update((arr) => [
          ...arr,
          { id: Date.now(), text, done: false },
        ]);
        draft.set("");
      });
    };

    const toggle = (id: number) =>
      items.update((arr) =>
        arr.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );

    const remove = (id: number) =>
      items.update((arr) => arr.filter((t) => t.id !== id));

    const renderItem = (t: Todo) => html`
      <li>
        <input
          type="checkbox"
          ?checked=${t.done}
          @change=${() => toggle(t.id)}
        />
        <span class=${t.done ? "done" : ""}>${t.text}</span>
        <button @click=${() => remove(t.id)} aria-label="Delete">×</button>
      </li>
    `;

    return () => html`
      <div class="card">
        <h2>Todos (${remaining} left)</h2>
        <form @submit=${(e: Event) => {
          e.preventDefault();
          add();
        }}>
          <input
            .value=${draft}
            @input=${(e: Event) =>
              draft.set((e.target as HTMLInputElement).value)}
            placeholder="what to do..."
          />
          <button type="submit">add</button>
        </form>
        <ul>
          ${() => each(items(), (t) => t.id, renderItem)}
        </ul>
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .card { padding: 1rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
      ul { list-style: none; padding: 0; margin: 0; }
      li { display: flex; align-items: center; gap: .5rem; padding: .25rem 0; }
      .done { text-decoration: line-through; opacity: .6; }
      input:not([type]), input[type=text] {
        padding: .25rem .5rem; border: 1px solid #999; border-radius: 4px;
      }
    `,
  },
);
