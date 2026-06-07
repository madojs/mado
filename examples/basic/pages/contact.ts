/**
 * Contact: form through useForm + Constraint Validation API.
 */

import { page, component, html, css, signal, useForm } from "@madojs/mado";

interface ContactValues {
  name: string;
  email: string;
  age: number | "";
  [key: string]: string | number | boolean | undefined;
}

component(
  "x-contact-page",
  () => {
    const f = useForm<ContactValues>(
      {
        name: { required: true, minLength: 2, default: "" },
        email: { required: true, type: "email", default: "" },
        age: { required: true, type: "number", min: 18, max: 120, default: "" },
      },
      {
        validate: (v) =>
          v.name && v.name.toLowerCase() === "admin"
            ? { name: "the name 'admin' is reserved" }
            : null,
      },
    );

    const sent = signal<ContactValues | null>(null);

    const submit = f.onSubmit(async (values) => {
      await new Promise((r) => setTimeout(r, 400));
      sent.set(values);
      f.reset();
    });

    const fieldError = (name: keyof ContactValues) => () =>
      f.touched()[name as string] && f.errors()[name as string]
        ? html`<small class="err">${f.errors()[name as string]}</small>`
        : null;

    return () => html`
      <div class="card">
        <h2>Form</h2>
        <form @submit=${submit} novalidate>
          <label>
            Name
            <input name="name" .value=${() => f.values().name ?? ""}
              @input=${f.onInput} @blur=${f.onBlur} />
            ${fieldError("name")}
          </label>
          <label>
            Email
            <input name="email" type="email" .value=${() => f.values().email ?? ""}
              @input=${f.onInput} @blur=${f.onBlur} />
            ${fieldError("email")}
          </label>
          <label>
            Age
            <input name="age" type="number" .value=${() => String(f.values().age ?? "")}
              @input=${f.onInput} @blur=${f.onBlur} />
            ${fieldError("age")}
          </label>
          <button type="submit" ?disabled=${() => f.submitting() || !f.isValid()}>
            ${() => (f.submitting() ? "sending…" : "send")}
          </button>
        </form>
        ${() =>
          sent()
            ? html`<p class="ok">sent: ${JSON.stringify(sent())}</p>`
            : null}
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .card { padding: 1rem; border: 1px solid var(--border, #ccc); border-radius: 8px; }
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
  title: "Form",
  view: () => html`<x-contact-page></x-contact-page>`,
});
