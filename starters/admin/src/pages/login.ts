// Login page. Reads `?return=` to bounce the user back where they were
// blocked by `requireAuth`.

import { html, navigate, page, queryParam, signal, useForm } from "@madojs/mado";
import { ApiError } from "../lib/api.js";
import { login } from "../lib/auth.js";
import "../components/x-input.js";
import "../components/x-button.js";

export default page({
  title: "Sign in",
  view: () => {
    const returnTo = queryParam("return", "/admin");
    const serverError = signal<string | null>(null);

    const form = useForm({
      email: { required: true, type: "email" as const },
      password: { required: true, min: 4 },
    });

    const onSubmit = form.onSubmit(async (values) => {
      serverError.set(null);
      try {
        await login({
          email: String(values.email ?? ""),
          password: String(values.password ?? ""),
        });
        navigate(returnTo(), { replace: true });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          serverError.set("Invalid email or password.");
        } else {
          serverError.set("Something went wrong. Try again.");
        }
      }
    });

    return html`
      <h1 style="margin:0 0 16px;">Sign in</h1>
      <p class="muted" style="margin:0 0 24px;">
        Enter your credentials to continue.
      </p>
      <form @submit=${onSubmit} class="stack">
        <x-input
          label="Email"
          name="email"
          type="email"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>
        <x-input
          label="Password"
          name="password"
          type="password"
          required
          @input=${form.onInput}
          @blur=${form.onBlur}
        ></x-input>
        ${() =>
          serverError()
            ? html`<small style="color:var(--danger);">${serverError()}</small>`
            : null}
        <x-button
          ?disabled=${() => !form.isValid() || form.submitting()}
        >${() => (form.submitting() ? "Signing in…" : "Sign in")}</x-button>
      </form>
    `;
  },
});