import { html, navigate, page, signal, useForm } from "@madojs/mado";

import "../../shared/ui/x-button.component";

import { login } from "./auth.service";

// 1. LOCAL STATE
// (per-view)

// 2. DATA
// (none)

// 3. ACTIONS — handled inside the view (useForm is per-render)

// 4. VIEW
export default page({
  title: "Sign in",
  view: () => {
    const submitting = signal(false);
    const error = signal<string | null>(null);
    const form = useForm({
      email: { required: true, type: "email" },
      password: { required: true, minLength: 6 },
    });

    const onSubmit = form.onSubmit(async (values) => {
      submitting.set(true);
      error.set(null);
      try {
        await login({
          email: String(values.email ?? ""),
          password: String(values.password ?? ""),
        });
        navigate("/");
      } catch (err) {
        error.set(err instanceof Error ? err.message : "Login failed");
      } finally {
        submitting.set(false);
      }
    });

    return html`
      <section>
        <h1>Sign in</h1>
        <form @submit=${onSubmit}>
          <label>
            Email
            <input name="email" type="email" required @input=${form.onInput} />
          </label>
          <label>
            Password
            <input name="password" type="password" required @input=${form.onInput} />
          </label>
          ${() => (error() ? html`<p class="error">${error()}</p>` : null)}
          <x-button ?disabled=${() => submitting() || !form.isValid()}>
            ${() => (submitting() ? "Signing in…" : "Sign in")}
          </x-button>
        </form>
      </section>
    `;
  },
});
