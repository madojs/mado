/**
 * Post detail. Demonstrates:
 *   - resource with a reactive key (derived from params.slug);
 *   - bake.paths() + bake.data(): this page could generate static output for
 *     every slug. The bake config is shown as a comment; to run it, install
 *     linkedom + esbuild.
 *   - head() with dynamic JSON-LD from post data.
 */

import { page, html, css, component, each, resource } from "madojs";
import { api, type BlogPost } from "../lib/api.js";

component(
  "x-blog-post",
  ({ host }) => {
    // slug is passed as an attribute from the page view.
    // Watch property/attribute changes.
    const slug = (): string => host.getAttribute("data-slug") ?? "";

    const post = resource<BlogPost>(
      () => `/blog/posts/${slug()}`,
      () => api.getPost(slug()),
    );

    return () => html`
      <article class="post">
        <a href="/blog" data-link class="back">← All posts</a>
        ${() => {
          if (post.loading()) return html`<p class="muted">Loading…</p>`;
          if (post.error()) return html`<p class="err">${() => post.error()!.message}</p>`;
          const p = post.data();
          if (!p) return html`<p class="muted">Post not found</p>`;
          return html`
            <header>
              <h1>${p.title}</h1>
              <time class="muted">${p.publishedAt}</time>
            </header>
            <div class="body">
              ${each(
                p.body.split("\n\n"),
                (para) => para,
                (para) => html`<p>${para}</p>`,
              )}
            </div>
          `;
        }}
      </article>
    `;
  },
  {
    styles: css`
      :host { display: block; padding: 3rem 1rem; max-width: 680px; margin: 0 auto; }
      .back {
        display: inline-block;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        color: var(--fg-muted);
      }
      .post header { margin-bottom: 1.5rem; }
      h1 { margin: 0 0 0.5rem; }
      .muted { color: var(--fg-muted); }
      .err { color: #b91c1c; }
      .body p {
        margin: 0 0 1rem;
        line-height: 1.7;
      }
    `,
  },
);

export default page<{ slug: string }>({
  title: ({ slug }) => `Post: ${slug}`,
  head: ({ slug }, data) => {
    // data can come from bake (see the config below) or from load().
    const p = data as BlogPost | undefined;
    return {
      description: p?.excerpt ?? `Post ${slug}`,
      canonical: `/blog/${slug}`,
      og: p
        ? {
            title: p.title,
            description: p.excerpt,
            type: "article",
          }
        : undefined,
      jsonLd: p
        ? {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: p.title,
            description: p.excerpt,
            datePublished: p.publishedAt,
          }
        : undefined,
    };
  },
  // Smart Static bake config. Commented out because it needs linkedom +
  // esbuild (see showcase README).
  //
  // bake: {
  //   paths: async () => {
  //     const out = [];
  //     for (const slug of await api.allSlugs()) out.push({ slug });
  //     return out;
  //   },
  //   data: ({ slug }) => api.getPost(slug),
  //   revalidate: 3600,
  // },
  view: ({ params }) => html`<x-blog-post data-slug=${params.slug}></x-blog-post>`,
});
