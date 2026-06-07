import { html, page } from "@madojs/mado";

export default page({
  title: "__APP_NAME__",
  view: () => html`
    <main class="shell">
      <section class="panel">
        <p class="eyebrow">Mado starter</p>
        <h1>__APP_NAME__</h1>
        <p>
          A tiny native-web app with browser ESM, Web Components, signals and
          tagged-template HTML.
        </p>
        <x-app-counter></x-app-counter>
      </section>
    </main>
  `,
});
