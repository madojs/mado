import { page, html } from "@madojs/mado";
import "../components/x-shell.js";

export default page({
  title: "Not found",
  view: () => html`
    <x-ticket-shell>
      <h2>Not found</h2>
      <p class="muted">This route is not part of the tickets example.</p>
      <p><a href="/" data-link>Back to overview</a></p>
    </x-ticket-shell>
  `,
});
