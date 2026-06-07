/**
 * Posts: list with pagination through query params.
 *
 * Demonstrates:
 *   - resource() lazy loading
 *   - queryParam state in the URL
 *   - mutation create + cache invalidation
 *
 * Page logic lives in a tiny internal component setup function. Small pages can
 * live directly in view(), but non-trivial pages are clearer with one internal
 * component.
 */

import {
  page,
  component,
  html,
  css,
  each,
  resource,
  mutation,
  queryParam,
} from "@madojs/mado";

import { api, type Post } from "../lib/api.js";

component(
  "x-posts-page",
  () => {
    const pageQ = queryParam("page", "1");
    const limit = 5;

    const posts = resource<Post[]>(
      () => api.posts.listUrl(+pageQ(), limit),
      api.posts.list,
      { staleTime: 30_000 },
    );

    const create = mutation<{ title: string }, Post>(
      ({ title }) => api.posts.create(title),
      { invalidates: [api.posts.listKey()] },
    );

    const onCreate = () =>
      create.run({ title: `Post at ${new Date().toLocaleTimeString()}` });

    return () => html`
      <div class="card">
        <h2>Posts</h2>
        <p class="bar">
          Page:
          <button @click=${() =>
            pageQ.set(String(Math.max(1, +pageQ() - 1)))}>‹</button>
          <b>${pageQ}</b>
          <button @click=${() => pageQ.set(String(+pageQ() + 1))}>›</button>
          ·
          <button @click=${() => posts.refresh()}>↻ refresh</button>
          ·
          <button @click=${onCreate} ?disabled=${create.loading}>＋ create</button>
        </p>
        ${() => (posts.loading() ? html`<p><i>loading…</i></p>` : null)}
        ${() =>
          posts.error()
            ? html`<p class="err">${posts.error()!.message}</p>`
            : null}
        ${() =>
          create.error()
            ? html`<p class="err">create: ${create.error()!.message}</p>`
            : null}
        <ul>
          ${() =>
            each(
              posts.data() ?? [],
              (p) => p.id,
              (p) => html`<li><b>#${p.id}</b> ${p.title}</li>`,
            )}
        </ul>
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .card { padding: 1rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
      .bar button:disabled { opacity: .5; }
      .err { color: #c00; }
      ul { padding-left: 1.2rem; }
      li { margin: .25rem 0; }
    `,
  },
);

export default page({
  title: "Posts",
  view: () => html`<x-posts-page></x-posts-page>`,
});
