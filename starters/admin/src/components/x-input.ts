// <x-input label name type placeholder required value @input @blur>
//
// Labeled input that proxies its events. Use inside `useForm()`:
//
//   <x-input name="email" type="email" required
//            @input=${form.onInput} @blur=${form.onBlur}></x-input>

import { component, css, html } from "@madojs/mado";

component(
  "x-input",
  ({ host }) => () => {
    const label = host.getAttribute("label") ?? "";
    const name = host.getAttribute("name") ?? "";
    const type = host.getAttribute("type") ?? "text";
    const placeholder = host.getAttribute("placeholder") ?? "";
    const required = host.hasAttribute("required");
    const value = host.getAttribute("value") ?? "";
    const error = host.getAttribute("error");

    return html`
      <label>
        ${label
          ? html`<span class="lbl">${label}${required ? html`<em>*</em>` : null}</span>`
          : null}
        <input
          name=${name}
          type=${type}
          placeholder=${placeholder}
          ?required=${required}
          .value=${value}
        >
        ${error ? html`<small class="err">${error}</small>` : null}
      </label>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      label { display: block; }
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