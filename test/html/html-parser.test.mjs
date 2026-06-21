// html.ts parser tests for edge cases that used to break the regex-based
// implementation.
//
// Goal: pin down what a correct parser must handle. These tests were failing
// before the state-machine tokenizer landed.

import test from "node:test";
import assert from "node:assert/strict";

// minimal DOM stub
const { parseHTML } = await import("linkedom");
const { window: w } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>",
);
globalThis.window = w;
globalThis.document = w.document;
globalThis.Node = w.Node;
globalThis.HTMLElement = w.HTMLElement ?? class {};
globalThis.Comment = w.Comment ?? class {};
globalThis.DocumentFragment = w.DocumentFragment ?? class {};
globalThis.Element = w.Element ?? class {};
globalThis.customElements = w.customElements;

const { html, render } = await import("../../dist/src/html/template.js");
const { signal, flushSync } = await import("../../dist/src/signal.js");

/** Render a template into a fresh div and return it. */
function renderIn(tpl) {
  const div = document.createElement("div");
  render(tpl, div);
  return div;
}

// ---------- Base cases that should work ----------

test("base: one text binding", () => {
  const el = renderIn(html`<p>${"hello"}</p>`);
  assert.equal(el.querySelector("p").textContent, "hello");
});

test("base: one attribute binding", () => {
  const el = renderIn(html`<div class=${"a b"}></div>`);
  assert.equal(el.querySelector("div").getAttribute("class"), "a b");
});

test("nested reactive template cleanup: async route outlet does not accumulate pages", () => {
  const div = document.createElement("div");
  const ready = signal(false);
  const view = signal(html`${() => (ready() ? html`<x-page-a></x-page-a>` : "")}`);

  render(html`${view}`, div);
  assert.equal(div.querySelectorAll("x-page-a").length, 0);

  ready.set(true);
  flushSync();
  assert.equal(div.querySelectorAll("x-page-a").length, 1);

  view.set(html`<x-page-b></x-page-b>`);
  flushSync();

  assert.equal(div.querySelectorAll("x-page-a").length, 0);
  assert.equal(div.querySelectorAll("x-page-b").length, 1);
});

test("nested reactive template cleanup: removed child effect unsubscribes", () => {
  const div = document.createElement("div");
  const show = signal(true);
  const label = signal("open");
  let nestedRenders = 0;

  render(
    html`${() =>
      show()
        ? html`<section>${() => {
            nestedRenders++;
            return label();
          }}</section>`
        : html`<aside>closed</aside>`}`,
    div,
  );

  assert.equal(div.querySelector("section").textContent, "open");
  assert.equal(nestedRenders, 1);

  show.set(false);
  flushSync();
  assert.equal(div.querySelector("section"), null);
  assert.equal(div.querySelector("aside").textContent, "closed");

  label.set("stale");
  flushSync();

  assert.equal(nestedRenders, 1);
  assert.equal(div.querySelector("aside").textContent, "closed");
});

test("nested reactive template cleanup: dispose removes nested custom element", () => {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const show = signal(true);
  let disconnected = 0;

  if (!customElements.get("x-nested-dispose")) {
    customElements.define(
      "x-nested-dispose",
      class extends HTMLElement {
        disconnectedCallback() {
          disconnected++;
        }
      },
    );
  }

  render(
    html`${() =>
      show()
        ? html`<article><x-nested-dispose></x-nested-dispose></article>`
        : html`<aside>gone</aside>`}`,
    div,
  );

  assert.equal(div.querySelectorAll("x-nested-dispose").length, 1);

  show.set(false);
  flushSync();

  assert.equal(div.querySelectorAll("x-nested-dispose").length, 0);
  assert.equal(div.querySelector("aside").textContent, "gone");
  assert.equal(disconnected, 1);
  div.remove();
});

// ---------- Edge cases ----------

test("attribute with double quotes and spaces in the value", () => {
  // <div title="hello world" data-x=${v}>
  // The old regex could misread context because of spaces in title.
  const el = renderIn(
    html`<div title="hello world" data-x=${"42"}></div>`,
  );
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("title"), "hello world");
  assert.equal(div.getAttribute("data-x"), "42");
});

test("attribute with single quotes and spaces", () => {
  const el = renderIn(
    html`<div title='hello world' data-x=${"42"}></div>`,
  );
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("title"), "hello world");
  assert.equal(div.getAttribute("data-x"), "42");
});

test("unquoted attribute with binding as value", () => {
  // <input value=${v} required>
  const el = renderIn(html`<input value=${"hi"} required>`);
  const input = el.querySelector("input");
  assert.equal(input.getAttribute("value"), "hi");
  // required should remain a boolean attribute.
  assert.ok(input.hasAttribute("required"));
});

test("binding inside a string attribute (interpolation)", () => {
  // <a href='/users/${id}/profile'>
  // This is a common case: a path assembled from parts.
  // The old parser placed a marker at ${}, expecting the binding to replace the
  // whole attribute, while here it is only one part. Correct behavior is either
  // explicit unsupported syntax (throw) or assembling the attribute from parts.
  // At minimum, it must not silently produce garbage.
  let threw = false;
  let result = null;
  try {
    const el = renderIn(html`<a href="/users/${"42"}/profile">x</a>`);
    result = el.querySelector("a")?.getAttribute("href") ?? null;
  } catch {
    threw = true;
  }
  // Acceptable outcome: correct concatenation or an explicit error.
  assert.ok(
    threw || result === "/users/42/profile",
    `attribute interpolation should either work or throw explicitly; got: ${JSON.stringify(result)}`,
  );
});

test("text with < that is not an opening tag", () => {
  // <p>a < b ${x}</p>
  // The old lastOpen > lastClose heuristic wrongly said "inside a tag".
  const el = renderIn(html`<p>a < b ${"!"}</p>`);
  const p = el.querySelector("p");
  assert.ok(p, "<p> should be rendered");
  assert.match(p.textContent, /a\s*<\s*b\s*!/);
});

test("text with > that is not a closing tag", () => {
  const el = renderIn(html`<p>a > b ${"!"}</p>`);
  const p = el.querySelector("p");
  assert.ok(p);
  assert.match(p.textContent, /a\s*>\s*b\s*!/);
});

test("self-closing custom element", () => {
  // <x-icon name=${n}/>
  // In HTML, self-closing non-void elements are debatable. At minimum, the name
  // attribute must land on the outer <x-icon>, not disappear into a nested node.
  const el = renderIn(html`<div><x-icon name=${"star"}/></div>`);
  const icon = el.querySelector("x-icon");
  assert.ok(icon, "<x-icon> should exist");
  assert.equal(icon.getAttribute("name"), "star");
});

test("several binding kinds in one tag", () => {
  // <input @input=${fn} .value=${v} ?disabled=${flag}>
  let inputCalled = false;
  const onInput = () => {
    inputCalled = true;
  };
  const el = renderIn(html`<input
    @input=${onInput}
    .value=${"abc"}
    ?disabled=${true}
  >`);
  const input = el.querySelector("input");
  assert.ok(input);
  // Event listener.
  input.dispatchEvent(new w.Event("input"));
  assert.equal(inputCalled, true, "@input handler should run");
  // Property.
  assert.equal(input.value, "abc", ".value should be set as a property");
  // Boolean attribute.
  assert.ok(input.hasAttribute("disabled"), "?disabled should set the attribute");
});

test("attributes without bindings are preserved as-is", () => {
  // The parser should not break attributes without ${}.
  const el = renderIn(html`<div id="x" class="a b c" data-y="z">${"text"}</div>`);
  const div = el.querySelector("div");
  assert.equal(div.id, "x");
  assert.equal(div.className, "a b c");
  assert.equal(div.getAttribute("data-y"), "z");
  assert.equal(div.textContent, "text");
});

test("bindings in SVG tag with camelCase attribute", () => {
  // <svg viewBox=${v}>: viewBox is case-sensitive in SVG.
  // linkedom may not distinguish case, but the parser should not break.
  let threw = false;
  try {
    renderIn(html`<svg viewBox=${"0 0 10 10"}><circle r="5"/></svg>`);
  } catch (err) {
    threw = true;
    // Parser exceptions only, not missing SVG API behavior.
  }
  assert.equal(threw, false, "parser should not throw on SVG attributes");
});

test("text node with several adjacent bindings", () => {
  const el = renderIn(html`<p>${"a"}${"b"}${"c"}</p>`);
  const p = el.querySelector("p");
  assert.equal(p.textContent, "abc");
});

test("text node with mixed static and dynamic text", () => {
  const el = renderIn(html`<p>hello ${"world"}, ${42} times</p>`);
  const p = el.querySelector("p");
  assert.match(p.textContent, /hello\s*world\s*,\s*42\s*times/);
});

test("attribute on tags in a multiline template", () => {
  const el = renderIn(html`
    <div
      class=${"a"}
      data-x=${"b"}
    >
      content
    </div>
  `);
  const div = el.querySelector("div");
  assert.equal(div.getAttribute("class"), "a");
  assert.equal(div.getAttribute("data-x"), "b");
});

test("nested elements with bindings at different levels", () => {
  const el = renderIn(html`
    <article class=${"post"}>
      <h1>${"Title"}</h1>
      <p>${"Body"}</p>
    </article>
  `);
  const article = el.querySelector("article");
  assert.equal(article.getAttribute("class"), "post");
  assert.equal(article.querySelector("h1").textContent, "Title");
  assert.equal(article.querySelector("p").textContent, "Body");
});

test("comment with binding inside does not crash the parser", () => {
  // <!-- ${x} -->: binding inside an HTML comment.
  // Correct behavior: either ignore it as a static comment or process it. The
  // important part is not crashing and not polluting the DOM.
  let threw = false;
  try {
    renderIn(html`<div><!-- value: ${"42"} --><p>after</p></div>`);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "parser should not throw on ${} in a comment");
});

test("<style> block without bindings parses as RAW_TEXT", () => {
  // <style> is a raw-text element; < inside it does not open tags.
  const el = renderIn(html`<div>
    <style>p { color: red; }</style>
    <p>${"hello"}</p>
  </div>`);
  const p = el.querySelector("p");
  assert.equal(p.textContent, "hello");
  const style = el.querySelector("style");
  assert.ok(style, "<style> should exist");
  assert.match(style.textContent, /color:\s*red/);
});

test("<script> block is not interpreted as HTML", () => {
  // Inside <script>, < and > are regular characters.
  const el = renderIn(html`<div>
    <script type="application/json">{"x": 1, "y": "<a>"}</script>
    <p>${"after"}</p>
  </div>`);
  const p = el.querySelector("p");
  assert.equal(p.textContent, "after");
});
