/**
 * Template: list page with URL filter and pagination.
 * Copy into src/pages/ and rename.
 */

import {
  page,
  component,
  html,
  css,
  each,
  resource,
  queryParam,
  jsonFetcher,
} from "@madojs/mado";

interface Item {
  id: number;
  name: string;
}

component(
  "x-__name__-page",
  () => {
    const search = queryParam("q", "");
    const pageQ = queryParam("page", "1");
    const limit = 20;

    const items = resource<Item[]>(
      () =>
        `/api/__name__?q=${encodeURIComponent(search())}&page=${pageQ()}&limit=${limit}`,
      jsonFetcher(),
      { staleTime: 30_000 },
    );

    return () => html`
      <section>
        <h1>__Name__</h1>
        <input
          placeholder="search..."
          .value=${search}
          @input=${(e: Event) =>
            search.set((e.target as HTMLInputElement).value)}
        />
        ${() => (items.loading() ? html`<p><i>loading…</i></p>` : null)}
        ${() =>
          items.error()
            ? html`<p class="err">${items.error()!.message}</p>`
            : null}
        <ul>
          ${() =>
            each(
              items.data() ?? [],
              (it) => it.id,
              (it) => html`<li>${it.name}</li>`,
            )}
        </ul>
        <nav>
          <button @click=${() =>
            pageQ.set(String(Math.max(1, +pageQ() - 1)))}>‹</button>
          <span>${pageQ}</span>
          <button @click=${() => pageQ.set(String(+pageQ() + 1))}>›</button>
        </nav>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .err { color: #c00; }
      ul { padding-left: 1.2rem; }
    `,
  },
);

export default page({
  title: "__Name__",
  view: () => html`<x-__name__-page></x-__name__-page>`,
});
