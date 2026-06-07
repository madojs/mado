/**
 * Home: landing page with hero, features and CTA. Static, ideal for bake.
 */

import { page, html, css, component } from "madojs";

component(
  "x-hero",
  () => {
    return () => html`
      <section class="hero">
        <h1>The platform already does a lot.</h1>
        <p class="lede">
          Mado is thin glue over Web Components, signals and native fetch.
          No required bundler, no Virtual DOM, no React.
        </p>
        <div class="cta">
          <a href="/blog/hello-Mado" data-link class="btn btn-primary">Read why</a>
          <a href="/pricing" data-link class="btn">Pricing</a>
        </div>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .hero {
        text-align: center;
        padding: 4rem 1rem;
      }
      h1 {
        font-size: 2.75rem;
        margin: 0 0 1rem;
      }
      .lede {
        font-size: 1.15rem;
        color: var(--fg-muted);
        max-width: 540px;
        margin: 0 auto 2rem;
      }
      .cta {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
      }
      .btn {
        padding: 0.6rem 1.2rem;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        text-decoration: none;
        color: var(--fg);
      }
      .btn-primary {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }
    `,
  },
);

component(
  "x-features",
  () => {
    return () => html`
      <section class="features">
        <div class="grid">
          <article>
            <h3>Zero runtime dependencies</h3>
            <p>Only TypeScript is required in devDeps. Build with tsc. Bundle optionally with esbuild.</p>
          </article>
          <article>
            <h3>~16KB gzip</h3>
            <p>The full runtime is small enough to stay boring. Less infrastructure, fewer surprises.</p>
          </article>
          <article>
            <h3>Platform first</h3>
            <p>Custom Elements, Shadow DOM, History API, fetch and signals with thin wrappers, not a replacement platform.</p>
          </article>
          <article>
            <h3>Smart Static (bake)</h3>
            <p>Prerender pages with baked data for SEO without an SSR server.</p>
          </article>
        </div>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; padding: 3rem 1rem; background: var(--bg-alt); }
      .grid {
        max-width: 960px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.5rem;
      }
      article {
        background: var(--bg);
        padding: 1.5rem;
        border-radius: var(--radius);
        border: 1px solid var(--border);
      }
      h3 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
      }
      p {
        margin: 0;
        color: var(--fg-muted);
        font-size: 0.95rem;
      }
    `,
  },
);

export default page({
  title: "Mado — native-web frontend framework",
  head: () => ({
    description:
      "A small frontend framework with Web Components, signals and native fetch. Zero runtime dependencies.",
    canonical: "/",
    og: {
      title: "madojs",
      description: "The platform already does a lot. Thin glue instead of framework sprawl.",
      type: "website",
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "madojs",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
    },
  }),
  view: () => html`
    <x-hero></x-hero>
    <x-features></x-features>
  `,
});
