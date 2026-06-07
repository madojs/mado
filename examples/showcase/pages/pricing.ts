/**
 * Pricing: static content + interaction. Demonstrates:
 *   - signal for the billing toggle;
 *   - lazy computed for price recalculation;
 *   - conditional rendering through a signal function in html``.
 */

import { page, html, css, component, signal, computed, each } from "madojs";

component(
  "x-pricing",
  () => {
    const yearly = signal(false);

    const discountNote = computed(() =>
      yearly() ? "−20% with annual billing" : "monthly billing",
    );

    const plans = [
      { name: "Hobby", monthly: 0, features: ["1 project", "Community", "Bake up to 100 pages"] },
      { name: "Pro", monthly: 19, features: ["Unlimited projects", "Email support", "Unlimited bake", "Custom domain"] },
      { name: "Team", monthly: 49, features: ["Up to 10 developers", "SLA 99.9%", "Audit log", "SSO"] },
    ];

    const price = (m: number) => (yearly() ? Math.round(m * 12 * 0.8) : m);
    const unit = () => (yearly() ? "/year" : "/mo");

    return () => html`
      <section class="head">
        <h1>Simple pricing</h1>
        <p class="muted">${discountNote}</p>
        <label class="switch">
          <input
            type="checkbox"
            .checked=${yearly}
            @change=${(e: Event) => yearly.set((e.target as HTMLInputElement).checked)}
          />
          Annual billing
        </label>
      </section>

      <section class="plans">
        ${each(
          plans,
          (p) => p.name,
          (p) => html`
            <article class="plan">
              <h3>${p.name}</h3>
              <div class="price">
                $${() => price(p.monthly)}
                <span class="unit">${unit}</span>
              </div>
              <ul>
                ${each(
                  p.features,
                  (feature) => feature,
                  (feature) => html`<li>${feature}</li>`,
                )}
              </ul>
              <a href="/app/login" data-link class="btn">Start</a>
            </article>
          `,
        )}
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; padding: 3rem 1rem; }
      .head { text-align: center; margin-bottom: 2rem; }
      .head h1 { margin: 0 0 0.5rem; }
      .muted { color: var(--fg-muted); }
      .switch {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 1rem;
        cursor: pointer;
      }
      .plans {
        max-width: 960px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.5rem;
      }
      .plan {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
      }
      h3 { margin: 0 0 0.5rem; }
      .price {
        font-size: 2rem;
        font-weight: 600;
        margin: 0.5rem 0 1rem;
      }
      .unit { font-size: 0.9rem; color: var(--fg-muted); font-weight: 400; }
      ul {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem;
        flex: 1;
      }
      li {
        padding: 0.25rem 0;
        color: var(--fg-muted);
        font-size: 0.95rem;
      }
      li::before { content: "✓ "; color: var(--accent); }
      .btn {
        display: inline-block;
        padding: 0.5rem 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        text-align: center;
        color: var(--fg);
      }
    `,
  },
);

export default page({
  title: "Pricing",
  head: () => ({
    description: "Transparent Mado cloud pricing (demo).",
    canonical: "/pricing",
  }),
  view: () => html`<x-pricing></x-pricing>`,
});
