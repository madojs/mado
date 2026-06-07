/**
 * Home: product catalog + basic demo.
 * Imports components for side-effect registration.
 */

import { page, html } from "@madojs/mado";
import { products } from "../lib/products.js";
import "../components/counter.js";
import "../components/todos.js";

export default page({
  title: "Home",
  head: () => ({
    description: "Mado ecommerce page demo: Smart Static + SPA.",
    og: { title: "Mado demo shop", type: "website" },
  }),
  view: () => html`
    <div>
      <h1>Mado demo</h1>
      <p>
        Visit <a href="/posts" data-link>posts</a>,
        <a href="/contact" data-link>the form</a>
        or <a href="/about" data-link>about</a>.
      </p>

      <h2>Catalog (Smart Static)</h2>
      <p>
        These pages are baked with <code>npm run bake</code>
        with meta tags and JSON-LD for Google rich snippets:
      </p>
      <ul>
        ${products.map(
          (p) => html`
            <li>
              <a href=${`/product/${p.slug}`} data-link>${p.name}</a>
              — ${p.price} ${p.currency}
            </li>
          `,
        )}
      </ul>

      <hr />
      <x-counter></x-counter>
      <hr />
      <x-todos></x-todos>
    </div>
  `,
});
