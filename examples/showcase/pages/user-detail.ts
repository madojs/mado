/**
 * User detail + edit. Demonstrates:
 *   - resource with a reactive key from params.id;
 *   - mutation with invalidates: ['/api/users*', '/api/stats'] —
 *     after saving, list and stats refetch automatically;
 *   - page-level errorView.
 */

import {
  page,
  html,
  css,
  component,
  resource,
  mutation,
  useForm,
  signal,
} from "madojs";
import { api, type User } from "../lib/api.js";

component(
  "x-user-detail",
  ({ host }) => {
    const id = (): number => Number(host.getAttribute("data-id") ?? "0");

    const userRes = resource<User>(
      () => `/api/users/${id()}`,
      () => api.getUser(id()),
    );

    const editing = signal(false);

    const f = useForm({
      name: { required: true },
      email: { required: true, type: "email" },
      role: { required: true },
    });

    const save = mutation(
      async (patch: Partial<User>) => {
        return api.updateUser(id(), patch);
      },
      {
        invalidates: ["/api/users", "/api/users/", "/api/stats"],
      },
    );

    const del = mutation<void, void>(
      async () => {
        return api.deleteUser(id());
      },
      { invalidates: ["/api/users", "/api/stats"] },
    );

    const onEdit = () => {
      const u = userRes.data();
      if (!u) return;
      f.reset();
      f.setField("name", u.name);
      f.setField("email", u.email);
      f.setField("role", u.role);
      editing.set(true);
    };

    const onCancel = () => {
      editing.set(false);
      save.reset();
    };

    const onSubmit = f.onSubmit(async (values) => {
      try {
        const updated = await save.run(values as Partial<User>);
        // Optimistic local resource cache update.
        userRes.mutate(updated);
        editing.set(false);
      } catch {
        // Error remains in save.error().
      }
    });

    const onDelete = async () => {
      if (!confirm(`Delete user #${id()}?`)) return;
      try {
        await del.run(undefined);
        history.pushState(null, "", "/app/users");
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        /* in del.error() */
      }
    };

    return () => html`
      <a href="/app/users" data-link class="back">← Back to list</a>

      ${() => {
        if (userRes.loading() && !userRes.data())
          return html`<p class="muted">Loading…</p>`;
        if (userRes.error())
          return html`<p class="err">${() => userRes.error()!.message}</p>`;
        const u = userRes.data();
        if (!u) return null;

        if (editing()) {
          return html`
            <h1>Edit #${u.id}</h1>
            <form @submit=${onSubmit} class="form">
              <label>
                Name
                <input
                  name="name"
                  required
                  .value=${() => f.values().name ?? ""}
                  @input=${f.onInput}
                  @blur=${f.onBlur}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  .value=${() => f.values().email ?? ""}
                  @input=${f.onInput}
                  @blur=${f.onBlur}
                />
              </label>
              <label>
                Role
                <select
                  name="role"
                  required
                  .value=${() => f.values().role ?? "user"}
                  @change=${f.onInput}
                  @blur=${f.onBlur}
                >
                  <option value="admin">admin</option>
                  <option value="user">user</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>

              ${() =>
                save.error()
                  ? html`<p class="err">${() => save.error()!.message}</p>`
                  : null}

              <div class="actions">
                <button
                  type="submit"
                  class="btn primary"
                  ?disabled=${() => !f.isValid() || save.loading()}
                >
                  ${() => (save.loading() ? "Saving…" : "Save")}
                </button>
                <button type="button" class="btn" @click=${onCancel}>Cancel</button>
              </div>
            </form>
          `;
        }

        return html`
          <h1>${u.name}</h1>
          <dl>
            <dt>ID</dt><dd>#${u.id}</dd>
            <dt>Email</dt><dd>${u.email}</dd>
            <dt>Role</dt><dd><span class="badge badge-${u.role}">${u.role}</span></dd>
            <dt>Created</dt><dd>${u.createdAt}</dd>
          </dl>

          <div class="actions">
            <button class="btn primary" @click=${onEdit}>Edit</button>
            <button
              class="btn danger"
              @click=${onDelete}
              ?disabled=${() => del.loading()}
            >
              ${() => (del.loading() ? "Deleting…" : "Delete")}
            </button>
          </div>
        `;
      }}
    `;
  },
  {
    styles: css`
      :host { display: block; max-width: 520px; }
      .back {
        display: inline-block;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        color: var(--fg-muted);
      }
      h1 { margin: 0 0 1rem; }
      .muted { color: var(--fg-muted); }
      .err { color: #b91c1c; margin: 0.5rem 0; }
      dl {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 0.5rem 1rem;
        margin: 0 0 1.5rem;
      }
      dt { color: var(--fg-muted); font-size: 0.9rem; }
      dd { margin: 0; }
      .badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        background: var(--bg-alt);
      }
      .badge-admin { background: var(--accent); color: white; }
      .badge-viewer { background: #fef3c7; color: #92400e; }
      .badge-user { background: #dcfce7; color: #166534; }
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .form label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.9rem;
        color: var(--fg-muted);
      }
      .form input, .form select {
        padding: 0.5rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font: inherit;
        color: var(--fg);
        background: var(--bg);
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .btn {
        padding: 0.5rem 1rem;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        cursor: pointer;
        font: inherit;
      }
      .btn.primary {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }
      .btn.danger {
        color: #b91c1c;
        border-color: #fecaca;
      }
      .btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  },
);

export default page<{ id: string }>({
  title: ({ id }) => `User #${id}`,
  view: ({ params }) =>
    html`<x-user-detail data-id=${params.id}></x-user-detail>`,
  errorView: (err) => html`<p style="color:#b91c1c">${err.message}</p>`,
});
