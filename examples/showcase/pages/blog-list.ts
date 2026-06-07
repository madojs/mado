/**
 * Blog post list. Loaded through resource(), which is lifecycle-aware: cleanup
 * happens automatically when leaving the page.
 */

import { page, html, css, component, resource, each } from "@madojs/mado";
import { api, type BlogPost } from "../lib/api.js";

component(
  "x-blog-list",
  () => {
    const posts = resource<BlogPost[]>(
      () => "/blog/posts",
      () => api.listPosts(),
    );

    return () => html`
      <section class="head">
        <h1>Blog</h1>
        <p class="muted">Notes on how to build, and not build, frontend apps.</p>
      </section>

      ${() => {
        if (posts.loading()) return html`<p class="muted">Loading…</p>`;
        if (posts.error()) return html`<p class="err">${() => posts.error()!.message}</p>`;
        const list = posts.data() ?? [];
        return html`
          <ul class="posts">
            ${() =>
              each(
                list,
                (p) => p.slug,
                (p) => html`
                  <li>
                    <a href="/blog/${p.slug}" data-link>
                      <h3>${p.title}</h3>
                      <p class="excerpt">${p.excerpt}</p>
                      <time class="muted">${p.publishedAt}</time>
                    </a>
                  </li>
                `,
              )}
          </ul>
        `;
      }}
    `;
  },
  {
    styles: css`
      :host { display: block; padding: 3rem 1rem; max-width: 720px; margin: 0 auto; }
      .head { text-align: center; margin-bottom: 2rem; }
      .head h1 { margin: 0 0 0.5rem; }
      .muted { color: var(--fg-muted); }
      .err { color: #b91c1c; }
      ul.posts {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      li a {
        display: block;
        padding: 1.25rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--fg);
        text-decoration: none;
      }
      li a:hover {
        background: var(--bg-alt);
      }
      h3 { margin: 0 0 0.25rem; font-size: 1.15rem; }
      .excerpt { margin: 0 0 0.5rem; color: var(--fg-muted); }
      time { font-size: 0.85rem; }
    `,
  },
);

export default page({
  title: "Blog",
  head: () => ({
    description: "Notes about Mado, the web platform and minimalism.",
    canonical: "/blog",
  }),
  view: () => html`<x-blog-list></x-blog-list>`,
});
