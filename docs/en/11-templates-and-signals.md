# Templates and signals

> Reactivity in Mado is one primitive — `signal()` — composed into
> three reading patterns. Templates are tagged `html\`\`` literals
> the browser understands directly.

By the end of this page you should be able to read and write any
Mado view without surprises.

## Signals

A signal is a getter function with a `.set()` method.

```ts
import { signal, computed, effect } from "@madojs/mado";

const count = signal(0);

count();                    // 0       — read
count.set(5);               //         — write
count.update((n) => n + 1); // 6       — derived write
count.peek();               // 6       — read without subscribing

const doubled = computed(() => count() * 2);
doubled();                  // 12

effect(() => console.log("count =", count()));
// → "count = 6"
count.set(7);
// → "count = 7"
```

Rules of thumb:

- A signal is a **function**: `count()`, not `count.value`.
- `effect()` and `computed()` track every signal read **during their
  callback**. There is no dependency array.
- `computed()` is lazy and de-duplicates: if its result is `Object.is`-
  equal to the previous one, subscribers do not re-run.
- `untracked(() => ...)` reads without subscribing. Use it inside
  async callbacks created from a synchronous `view()` so the router's
  render effect does not accidentally subscribe.
- `batch(() => { a.set(...); b.set(...); })` flushes once after the
  callback returns. `flushSync()` flushes pending effects immediately.

`effect()` cleanups run before the next run and on disposal. Inside a
component or a page they happen automatically when the host leaves
the DOM; outside, register the disposer through
`getCurrentLifecycle()` or pass an explicit one to a
`createLifecycle()` you own.

## Templates

`html\`\`` parses once per template literal into a static fragment +
binding indices, then patches only the changing slots on each
re-render.

```ts
import { html } from "@madojs/mado";

html`<h1>Hello, ${name}</h1>`;
```

Five binding shapes — and only these:

| Shape                | Meaning                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `${value}`           | Child content: text, nodes, arrays, nested `html`, `each()` results.    |
| `attr=${v}`          | HTML attribute. String / number / falsy (`false`/`null`/`undefined` → remove). |
| `.prop=${v}`         | DOM property. Use for `.value` of inputs, arrays, objects, numbers.     |
| `?attr=${flag}`      | Boolean attribute. `true` → present, `false` → absent (`?disabled`).    |
| `@event=${fn}`       | Event listener. Removed automatically on re-render.                     |

### The single most common mistake

```ts
const count = signal(0);

// ❌ NOT REACTIVE — count() is read once at render
html`<div>${count() * 2}</div>`

// ✅ REACTIVE — the function is re-invoked on signal change
html`<div>${() => count() * 2}</div>`

// ✅ ALSO OK — the signal itself IS a function
html`<div>${count}</div>`
```

Rule of thumb: if you wrote `signal()` (with parens) inside `${...}`,
wrap the whole expression in `() => ...`.

### Lists — `each(items, keyFn, renderFn)`

```ts
import { each } from "@madojs/mado";

html`<ul>
  ${() =>
    each(
      users(),
      (u) => u.id,
      (u) => html`<li>${u.name}</li>`,
    )}
</ul>`;
```

`each()` is keyed: rows keep DOM identity across re-orders, so input
focus, scroll position and component state survive. A plain `.map()`
works but is not keyed; avoid it for anything but throwaway lists.

### Directives

Inline helpers you import alongside `html`:

- `unsafeHTML(string)` — interpolate trusted HTML.
- `ref((el) => …)` — get a callback when the element mounts.
- `classMap({ active: isActive(), error: hasError() })` — toggle
  class names declaratively.
- `styleMap({ color: theme().fg, "--bg": theme().bg })` — set
  inline styles, including custom properties.

### Parser hard errors

Mado refuses templates it cannot represent safely. Two cases you
will hit:

```ts
// ❌ slots inside RAW_TEXT elements
html`<textarea>${draft}</textarea>`;
html`<title>${title}</title>`;

// ✅ use properties / page APIs
html`<textarea .value=${draft}></textarea>`;
page({ title: ({ id }) => `User ${id}`, view: () => html`<main></main>` });

// ❌ nested SVG-only templates (namespace context is lost)
html`<svg>${html`<circle r="5"></circle>`}</svg>`;

// ✅ keep SVG internals in one template
html`<svg viewBox="0 0 10 10"><circle r="5"></circle></svg>`;
```

No dynamic `${...}` child slots inside `<script>`, `<style>`,
`<textarea>` or `<title>`.

## How the two compose

```ts
import { html, page, signal } from "@madojs/mado";

export default page({
  title: "Counter",
  view: () => {
    // 1. local state
    const n = signal(0);

    // 2. event handlers
    const inc = () => n.update((x) => x + 1);

    // 3. view — values that change are wrapped in arrow functions
    return html`
      <main>
        <h1>Counter</h1>
        <button @click=${inc} ?disabled=${() => n() >= 10}>${n}</button>
      </main>
    `;
  },
});
```

A page's `view()` runs **once** when the route commits; the returned
template stays mounted until the route changes. Every reactive slot
re-evaluates independently — Mado never re-runs the whole view.

## Lifecycle reads

Inside a `component(setup, …)` you get the lifecycle through `ctx`:

```ts
component("x-timer", (ctx) => {
  const tick = signal(0);
  const id = setInterval(() => tick.update((n) => n + 1), 1000);
  ctx.onDispose(() => clearInterval(id));
  return () => html`<span>${tick}</span>`;
});
```

Inside a `page({ view })` use the same `onDispose` from the view
context:

```ts
export default page({
  view: ({ onDispose }) => {
    const handler = () => { /* … */ };
    window.addEventListener("resize", handler);
    onDispose?.(() => window.removeEventListener("resize", handler));
    return html`<main>…</main>`;
  },
});
```

`resource()`, `effect()` and `mutation()` subscribe to the active
lifecycle automatically — you do not write cleanup for them.

## Further reading

- [10-pages-and-components.md](./10-pages-and-components.md) — the
  page vs component decision.
- [13-data.md](./13-data.md) — `resource()` and `mutation()`.
- [31-reactivity-ordering.md](./31-reactivity-ordering.md) — signal
  scheduling, equality and teardown guarantees.