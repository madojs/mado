import { html, page } from "@madojs/mado";
import "../components/ticket-detail.js";

export default page<{ id: string }>({
  title: ({ id }) => `Ticket ${id}`,
  view: ({ params }) => html`<ticket-detail ticket-id=${params.id}></ticket-detail>`,
});
