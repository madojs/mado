/**
 * Product page: main Smart Static (bake) demo.
 *
 * What it shows:
 *   - bake.paths()   → all slugs (build-time)
 *   - bake.data()    → data for one product
 *   - head()         → meta description + OG + JSON-LD Product (Schema.org)
 *   - load()         → reuses baked data as initialData (instant)
 *
 * Result after `npm run bake`:
 *   out/product/mado-mug/index.html        — ready HTML with JSON-LD
 *   out/product/raw-bundler/index.html
 *   out/product/shadow-dom/index.html
 *   out/sitemap.xml
 *
 * Googlebot sees product, price and rating (if present) as rich snippets.
 * After a user opens the link, Web Components come alive and the page becomes
 * an SPA. No extra data request is needed because the data is already in DOM.
 */

import { page, component, html, css } from "madojs";
import { products, findProduct, type Product } from "../lib/products.js";

component(
  "x-product-page",
  ({ host }) => {
    const slug = () => host.dataset.slug ?? "";
    const product = () => findProduct(slug());

    return () => {
      const p = product();
      if (!p) return html`<p>Product not found.</p>`;
      return html`
        <article class="card">
          <img src=${p.image} alt=${p.name} />
          <h1>${p.name}</h1>
          <p>${p.description}</p>
          <strong>${p.price} ${p.currency}</strong>
          <button>Add to cart</button>
          <p><a href="/" data-link>← back to catalog</a></p>
        </article>
      `;
    };
  },
  {
    styles: css`
      :host { display: block; }
      .card {
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-bg);
      }
      img { max-width: 100%; border-radius: var(--radius-sm); }
      h1 { margin-top: var(--space-2); }
      strong { display: block; font-size: 1.5rem; margin: var(--space-2) 0; color: var(--color-accent); }
      button {
        background: var(--color-accent); color: white; border: 0;
        padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
        cursor: pointer; font-size: 1rem;
      }
    `,
  },
);

export default page<{ slug: string }, Product | undefined>({
  title: ({ slug }) => {
    const p = findProduct(slug);
    return p ? `${p.name} — MyShop` : "Product not found";
  },

  head: ({ slug }, baked) => {
    const p = baked ?? findProduct(slug);
    if (!p) return { title: "Product not found" };
    return {
      description: p.description,
      canonical: `/product/${p.slug}`,
      og: {
        title: p.name,
        description: p.description,
        image: p.image,
        type: "product",
      },
      twitter: { card: "summary_large_image" },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description,
        image: p.image,
        offers: {
          "@type": "Offer",
          price: p.price,
          priceCurrency: p.currency,
          availability: "https://schema.org/InStock",
        },
      },
    };
  },

  bake: {
    paths: () => products.map((p) => ({ slug: p.slug })),
    data: ({ slug }) => findProduct(slug),
    revalidate: 3600,
  },

  view: ({ params }) =>
    html`<x-product-page data-slug=${params.slug}></x-product-page>`,
});
