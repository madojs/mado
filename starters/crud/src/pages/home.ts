import { html, page } from "@madojs/mado";

export default page({
  title: "__APP_NAME__",
  view: () => html`
    <section class="page">
      <div class="hero">
        <p class="eyebrow">Mado CRUD starter</p>
        <h1>Small admin apps without frontend ceremony.</h1>
        <p>
          This starter shows routes, resources, mutations, forms, query params
          and keyed lists in a compact ticket admin.
        </p>
        <a class="button" href="/tickets" data-link>Open tickets</a>
      </div>
    </section>
  `,
});
