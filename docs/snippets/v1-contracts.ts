import {
  component,
  html,
  jsonFetcher,
  render,
  resource,
  unmount,
  useForm,
} from "@madojs/mado";
import { devtools } from "@madojs/mado/devtools.js";

interface Profile {
  email: string;
}

declare const container: HTMLElement;
declare function save(profile: Readonly<Profile>): Promise<void>;

const profile = resource(() => "/api/profile", jsonFetcher<Profile>(), {
  staleTime: 30_000,
});
const form = useForm({
  initial: { email: "" },
  validate: (_values, { signal }) => signal.aborted ? { $form: "cancelled" } : null,
});

component("x-profile", () => () => html`
  <form @submit=${form.onSubmit(save)}>
    <input name="email" type="email" required @input=${form.onInput} />
    <button type="submit">Save</button>
  </form>
`);

const dispose = render(html`${() => profile.data()?.email ?? "Loading"}`, container);
dispose();
unmount(container);
devtools.snapshot();
