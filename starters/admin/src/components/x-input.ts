// <x-input label name type placeholder required value error @input @blur>
//
// Labeled input that proxies its events. Use inside `useForm()`:
//
//   <x-input name="email" type="email" required
//            @input=${form.onInput} @blur=${form.onBlur}></x-input>
//
// Shadow DOM integration notes:
//   - `name` and `value` are exposed as DOM properties on the host so that
//     event retargeting (e.target → <x-input>) still works with useForm().
//     useForm.onInput reads e.target.name and e.target.value — without these
//     getters the form silently receives undefined.
//   - The inner <input> dispatches its events with `composed: true` (native
//     behaviour), so @input/@blur bubble through the shadow boundary.

import { component, css, html } from "@madojs/mado";

component(
  "x-input",
  ({ host, attr }) => {
    const label = attr("label", "");
    const name = attr("name", "");
    const type = attr("type", "text");
    const placeholder = attr("placeholder", "");
    const required = attr("required");
    const value = attr("value", "");
    const error = attr("error");

    // Proxy properties so useForm().onInput can read e.target.name / .value
    // even after Shadow DOM retargets e.target from <input> to <x-input>.
    Object.defineProperty(host, "name", {
      get: () => host.getAttribute("name") ?? "",
      configurable: true,
    });
    Object.defineProperty(host, "value", {
      get: () => host.shadowRoot?.querySelector("input")?.value ?? "",
      set: (v: string) => {
        const input = host.shadowRoot?.querySelector("input");
        if (input) input.value = v;
      },
      configurable: true,
    });

    return () => html`
      <label>
        ${() =>
          label()
            ? html`<span class="lbl"
                >${label}${() =>
                  required() !== "" ? html`<em>*</em>` : null}</span
              >`
            : null}
        <input
          name=${name}
          type=${type}
          placeholder=${placeholder}
          ?required=${() => required() !== ""}
          .value=${value}
        />
        ${() => (error() ? html`<small class="err">${error}</small>` : null)}
      </label>
    `;
  },
  {
    styles: css`
      :host {
        display: block;
      }
      label {
        display: block;
      }
      .lbl {
        display: block;
        font-size: 12px;
        color: var(--fg-muted);
        margin-bottom: var(--space-1);
      }
      .lbl em {
        color: var(--danger);
        font-style: normal;
        margin-left: 2px;
      }
      input {
        width: 100%;
        padding: 8px 10px;
        font: inherit;
        background: var(--bg);
        color: var(--fg);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
      }
      input:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
      }
      .err {
        display: block;
        color: var(--danger);
        font-size: 12px;
        margin-top: var(--space-1);
      }
    `,
  },
);
