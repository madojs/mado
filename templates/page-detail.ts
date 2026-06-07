/**
 * Template: detail page by :id (loads one entity).
 *
 * Add to routes.ts:
 *   '/__name__/:id': () => import('./pages/__name__-detail.js'),
 */

import {
  page,
  component,
  html,
  css,
  resource,
  jsonFetcher,
} from "@madojs/mado";

interface Entity {
  id: number;
  name: string;
}

component(
  "x-__name__-detail",
  ({ host }) => {
    // id comes from data-id; page() sets it from params.
    const idAttr = () => host.dataset.id ?? "";

    const item = resource<Entity>(
      () => `/api/__name__/${idAttr()}`,
      jsonFetcher(),
      { staleTime: 60_000 },
    );

    return () => html`
      <section>
        ${() =>
          item.loading()
            ? html`<p><i>loading…</i></p>`
            : item.error()
              ? html`<p class="err">${item.error()!.message}</p>`
              : item.data()
                ? html`
                    <h1>${item.data()!.name}</h1>
                    <p>id: ${item.data()!.id}</p>
                  `
                : null}
        <a href="/__name__" data-link>← back to list</a>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .err { color: #c00; }
    `,
  },
);

export default page<{ id: string }>({
  title: ({ id }) => `__Name__ #${id}`,
  view: ({ params }) =>
    html`<x-__name__-detail data-id=${params.id}></x-__name__-detail>`,
});
