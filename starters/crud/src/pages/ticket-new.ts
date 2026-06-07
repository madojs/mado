import { html, page } from "@madojs/mado";
import "../components/ticket-form.js";

export default page({
  title: "New ticket",
  view: () => html`<ticket-form></ticket-form>`,
});
