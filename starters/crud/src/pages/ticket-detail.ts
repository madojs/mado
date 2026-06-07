import { html, page } from "@madojs/mado";

export default page<{ id: string }>({
  title: ({ id }) => `Ticket ${id}`,
  view: ({ params }) => html`<ticket-detail ticket-id=${params.id}></ticket-detail>`,
});
