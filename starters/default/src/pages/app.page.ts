// SPA-only interactive route. No `static:` declaration, so
// `mado release` keeps it out of the sitemap and serves it through
// the `_mado/spa.html` fallback at runtime — the canonical home for
// in-app surfaces that should not appear in search results.
import { html, page, routeUrl, signal } from "@madojs/mado";

export default page({
  title: "App",
  head: () => ({
    description: "A live SPA route demonstrating signals and components.",
  }),
  view: () => {
    const name = signal("world");
    return html`
      <main class="document">
        <p><a data-link href=${routeUrl("/")}>← Home</a></p>
        <h1>Hello, ${() => name()}!</h1>
        <p>
          <label>
            Your name:
            <input
              type="text"
              .value=${() => name()}
              @input=${(e: Event) =>
                name.set((e.target as HTMLInputElement).value)}
            />
          </label>
        </p>
        <p>The same component model runs in the static landing AND here:</p>
        <feature-card title="Live + static, one model">
          Each <code>feature-card</code> below the title is a real custom
          element with its own open shadow root. It works inside the
          server-rendered snapshot and inside this SPA-only route without
          changing a single line.
        </feature-card>
        <p>And here is a tiny reactive component you can drive locally:</p>
        <p><live-counter></live-counter></p>
      </main>
    `;
  },
});