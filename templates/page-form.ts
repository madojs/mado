/**
 * Template: create/edit form page.
 */

import {
  page,
  component,
  html,
  css,
  signal,
  useForm,
  mutation,
} from "madojs";

interface Values {
  name: string;
  email: string;
  [k: string]: string | number | boolean | undefined;
}

component(
  "x-__name__-page",
  () => {
    const f = useForm<Values>({
      name: { required: true, minLength: 2, default: "" },
      email: { required: true, type: "email", default: "" },
    });

    const save = mutation<Values, Values>(async (v) => {
      const r = await fetch("/api/__name__", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Values;
    });

    const done = signal(false);

    const submit = f.onSubmit(async (v) => {
      await save.run(v);
      done.set(true);
      f.reset();
    });

    const err = (name: keyof Values) => () =>
      f.touched()[name as string] && f.errors()[name as string]
        ? html`<small class="err">${f.errors()[name as string]}</small>`
        : null;

    return () => html`
      <section>
        <h1>__Name__</h1>
        <form @submit=${submit} novalidate>
          <label>
            Name
            <input name="name" .value=${() => f.values().name ?? ""}
              @input=${f.onInput} @blur=${f.onBlur} />
            ${err("name")}
          </label>
          <label>
            Email
            <input name="email" type="email" .value=${() => f.values().email ?? ""}
              @input=${f.onInput} @blur=${f.onBlur} />
            ${err("email")}
          </label>
          <button type="submit"
            ?disabled=${() => !f.isValid() || f.submitting() || save.loading()}>
            ${() => (save.loading() || f.submitting() ? "saving…" : "save")}
          </button>
          ${() => (save.error() ? html`<p class="err">${save.error()!.message}</p>` : null)}
          ${() => (done() ? html`<p class="ok">saved</p>` : null)}
        </form>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      label { display: block; margin: .5rem 0; }
      input { display: block; margin-top: .25rem; padding: .25rem .5rem;
              border: 1px solid #999; border-radius: 4px; min-width: 14rem; }
      .err { color: #c00; }
      .ok  { color: #060; }
      button:disabled { opacity: .5; }
    `,
  },
);

export default page({
  title: "__Name__",
  view: () => html`<x-__name__-page></x-__name__-page>`,
});
