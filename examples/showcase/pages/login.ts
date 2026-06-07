/**
 * Login: demonstrates useForm() + mutation + navigate after success.
 *
 * Fields are validated natively through Constraint Validation API
 * (required/type/minlength attributes). Custom validation goes through
 * useForm's validate.
 */

import { page, html, css, component, useForm, mutation, navigate } from "@madojs/mado";
import { login } from "../lib/auth.js";

component(
  "x-login",
  () => {
    const f = useForm({
      email: { required: true, type: "email" },
      password: { required: true, minLength: 4 },
    });

    const submit = mutation(
      async (v: { email: string; password: string }) => {
        await login(v.email, v.password);
      },
    );

    const onSubmit = f.onSubmit(async (values) => {
      try {
        await submit.run(values as { email: string; password: string });
        navigate("/app/dashboard");
      } catch {
        // Error remains in submit.error().
      }
    });

    return () => html`
      <section class="login">
        <h1>Sign in</h1>
        <p class="muted">
          For demo: any seeded user email, password with 4+ characters.
          Hint: <code>anna@example.com</code> / <code>demo</code>.
        </p>

        <form @submit=${onSubmit} novalidate>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              @input=${f.onInput}
              @blur=${f.onBlur}
            />
            ${() =>
              f.touched().email && f.errors().email
                ? html`<small class="err">${() => f.errors().email}</small>`
                : null}
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minlength="4"
              @input=${f.onInput}
              @blur=${f.onBlur}
            />
            ${() =>
              f.touched().password && f.errors().password
                ? html`<small class="err">${() => f.errors().password}</small>`
                : null}
          </label>

          ${() =>
            submit.error()
              ? html`<p class="err">${() => submit.error()!.message}</p>`
              : null}

          <button
            type="submit"
            class="btn btn-primary"
            ?disabled=${() => !f.isValid() || submit.loading()}
          >
            ${() => (submit.loading() ? "Please wait…" : "Sign in")}
          </button>
        </form>
      </section>
    `;
  },
  {
    styles: css`
      :host { display: block; padding: 3rem 1rem; }
      .login {
        max-width: 380px;
        margin: 0 auto;
        padding: 2rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      h1 { margin: 0 0 0.5rem; }
      .muted {
        color: var(--fg-muted);
        font-size: 0.9rem;
        margin: 0 0 1.5rem;
      }
      code {
        background: var(--bg-alt);
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        font-size: 0.85em;
      }
      form { display: flex; flex-direction: column; gap: 1rem; }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.9rem;
        color: var(--fg-muted);
      }
      input {
        padding: 0.5rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font: inherit;
        color: var(--fg);
        background: var(--bg);
      }
      input:focus {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
      }
      .err { color: #b91c1c; font-size: 0.85rem; }
      .btn {
        padding: 0.6rem;
        border-radius: var(--radius);
        border: 1px solid var(--accent);
        background: var(--accent);
        color: white;
        font-size: 1rem;
        cursor: pointer;
      }
      .btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  },
);

export default page({
  title: "Sign in",
  view: () => html`<x-login></x-login>`,
});
