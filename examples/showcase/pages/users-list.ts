/**
 * User list. Useful stress-test screen:
 *   - resource loads the list;
 *   - queryParam keeps search/sort in the URL (?q=...&sort=...);
 *   - computed filters and sorts lazily;
 *   - each with keyed reconciliation reuses DOM nodes during sort.
 */

import {
  page,
  html,
  css,
  component,
  resource,
  computed,
  queryParam,
  each,
} from "madojs";
import { api, type User } from "../lib/api.js";

component(
  "x-users-list",
  () => {
    const users = resource(
      () => "/api/users",
      () => api.listUsers(),
      { staleTime: 5000 },
    );

    const q = queryParam("q", "");
    const sort = queryParam("sort", "name");

    const filtered = computed(() => {
      const list = users.data() ?? [];
      const needle = q().trim().toLowerCase();
      const s = sort();
      const fil = needle
        ? list.filter(
            (u) =>
              u.name.toLowerCase().includes(needle) ||
              u.email.toLowerCase().includes(needle),
          )
        : list;
      const sorted = [...fil].sort((a, b) => {
        if (s === "name") return a.name.localeCompare(b.name);
        if (s === "role") return a.role.localeCompare(b.role);
        if (s === "date") return a.createdAt.localeCompare(b.createdAt);
        return 0;
      });
      return sorted;
    });

    const onQuery = (e: Event) => q.set((e.target as HTMLInputElement).value);
    const onSort = (e: Event) => sort.set((e.target as HTMLSelectElement).value);

    return () => html`
      <header class="head">
        <h1>Users</h1>
        <p class="muted">Search and sort live in the URL (queryParam). DOM nodes are reused.</p>
      </header>

      <div class="controls">
        <input
          type="search"
          placeholder="Search by name or email..."
          .value=${q}
          @input=${onQuery}
        />
        <select @change=${onSort} .value=${sort}>
          <option value="name">by name</option>
          <option value="role">by role</option>
          <option value="date">by date</option>
        </select>
      </div>

      ${() => {
        if (users.loading() && !users.data()) return html`<p class="muted">Loading…</p>`;
        if (users.error()) return html`<p class="err">${() => users.error()!.message}</p>`;
        return html`
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${() =>
                each(
                  filtered(),
                  (u: User) => u.id,
                  (u: User) => html`
                    <tr>
                      <td class="muted">#${u.id}</td>
                      <td>${u.name}</td>
                      <td class="muted">${u.email}</td>
                      <td>
                        <span class="badge badge-${u.role}">${u.role}</span>
                      </td>
                      <td class="muted">${u.createdAt}</td>
                      <td>
                        <a href="/app/users/${u.id}" data-link>open</a>
                      </td>
                    </tr>
                  `,
                )}
            </tbody>
          </table>
          ${() =>
            filtered().length === 0
              ? html`<p class="muted">Nothing found</p>`
              : null}
        `;
      }}
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .head { margin-bottom: 1rem; }
      h1 { margin: 0 0 0.25rem; }
      .muted { color: var(--fg-muted); }
      .err { color: #b91c1c; }
      .controls {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      input[type="search"], select {
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font: inherit;
        color: var(--fg);
        background: var(--bg);
      }
      input[type="search"] { flex: 1; }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead th {
        text-align: left;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--fg-muted);
        padding: 0.5rem;
        border-bottom: 1px solid var(--border);
      }
      tbody td {
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid var(--border);
      }
      tbody tr:hover { background: var(--bg-alt); }
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
    `,
  },
);

export default page({
  title: "Users",
  view: () => html`<x-users-list></x-users-list>`,
});
