/**
 * Compact status/priority badge.
 * Attribute selectors keep the component reactive enough for template updates:
 * Mado changes attributes, CSS updates the visual tone.
 */

import { component, css, html } from "@madojs/mado";

component(
  "x-ticket-badge",
  () => () => html`<span><slot></slot></span>`,
  {
    styles: css`
      :host {
        display: inline-flex;
        align-items: center;
        width: max-content;
        max-width: 100%;
        min-height: 1.45rem;
        padding: 0 .5rem;
        border: 1px solid var(--badge-border, #d8dee9);
        border-radius: 999px;
        background: var(--badge-bg, #eef4ff);
        color: var(--badge-fg, #115e59);
        font-size: .78rem;
        font-weight: 700;
        line-height: 1;
        text-transform: capitalize;
      }
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :host([tone="open"]) {
        --badge-bg: #ecfdf3;
        --badge-border: #abefc6;
        --badge-fg: #067647;
      }
      :host([tone="pending"]) {
        --badge-bg: #fffaeb;
        --badge-border: #fedf89;
        --badge-fg: #b54708;
      }
      :host([tone="closed"]) {
        --badge-bg: #f2f4f7;
        --badge-border: #d0d5dd;
        --badge-fg: #475467;
      }
      :host([tone="high"]) {
        --badge-bg: #fff1f3;
        --badge-border: #fecdd6;
        --badge-fg: #c01048;
      }
      :host([tone="normal"]) {
        --badge-bg: #eff8ff;
        --badge-border: #b2ddff;
        --badge-fg: #175cd3;
      }
      :host([tone="low"]) {
        --badge-bg: #f8fafc;
        --badge-border: #cbd5e1;
        --badge-fg: #475569;
      }
    `,
  },
);
