import { html, page } from "@madojs/mado";
import "../components/ticket-list.js";

export default page({
  title: "Tickets",
  view: () => html`<ticket-list></ticket-list>`,
});
