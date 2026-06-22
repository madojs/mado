/**
 * Applying HeadMeta to document.<head> in SPA runtime.
 *
 * Approach: we mark all tags we create with the `data-mado-head` attribute.
 * On the next `applyHead` we first remove all ours, then insert the new ones.
 * Existing meta from static HTML (without `data-mado-head`) — we don't touch,
 * but they won't interfere: duplicates in <head> are valid.
 *
 * If HTML was snapshotted, meta+ld from page.head() are already there.
 * On first takeover we either skip applyHead, or mark static tags as not ours.
 * Client-side apply will add its own data-mado-head copies, and the old static
 * ones remain for SEO caching without any negative effect
 * (canonical, jsonLd — don't depend on count).
 *
 * For strict static HTML + SPA navigation: also mark static head tags with
 * `data-mado-head="static"`, then the first applyHead removes and replaces them.
 */

import type { HeadMeta } from "./page.js";

const MARK = "data-mado-head";

export function applyHead(meta: HeadMeta): void {
  // 1) remove our previous tags
  for (const el of document.head.querySelectorAll(`[${MARK}]`)) {
    el.remove();
  }

  // 2) title — separately
  if (meta.title) document.title = meta.title;

  // 3) description / canonical
  if (meta.description) {
    upsertMeta({ name: "description", content: meta.description });
  }
  if (meta.canonical) {
    upsertLink({ rel: "canonical", href: meta.canonical });
  }

  // 4) OG
  if (meta.og) {
    const og = meta.og;
    if (og.title) upsertMeta({ property: "og:title", content: og.title });
    if (og.description)
      upsertMeta({ property: "og:description", content: og.description });
    if (og.image) upsertMeta({ property: "og:image", content: og.image });
    if (og.type) upsertMeta({ property: "og:type", content: og.type });
    if (og.url) upsertMeta({ property: "og:url", content: og.url });
  }

  // 5) Twitter (inherits og.* if not set)
  if (meta.twitter || meta.og) {
    const tw = meta.twitter ?? {};
    const og = meta.og ?? {};
    upsertMeta({ name: "twitter:card", content: tw.card ?? "summary" });
    if (tw.title ?? og.title)
      upsertMeta({ name: "twitter:title", content: tw.title ?? og.title! });
    if (tw.description ?? og.description)
      upsertMeta({
        name: "twitter:description",
        content: tw.description ?? og.description!,
      });
    if (tw.image ?? og.image)
      upsertMeta({ name: "twitter:image", content: tw.image ?? og.image! });
  }

  // 6) Arbitrary meta
  for (const m of meta.meta ?? []) upsertMeta(m);

  // 7) Arbitrary link
  for (const l of meta.link ?? []) upsertLink(l);

  // 8) JSON-LD (Schema.org)
  if (meta.jsonLd != null) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(MARK, "");
    script.textContent = JSON.stringify(meta.jsonLd);
    document.head.appendChild(script);
  }
}

function upsertMeta(attrs: {
  name?: string;
  property?: string;
  content: string;
}) {
  const tag = document.createElement("meta");
  if (attrs.name) tag.setAttribute("name", attrs.name);
  if (attrs.property) tag.setAttribute("property", attrs.property);
  tag.setAttribute("content", attrs.content);
  tag.setAttribute(MARK, "");
  document.head.appendChild(tag);
}

function upsertLink(attrs: { rel: string; href: string; hreflang?: string }) {
  const tag = document.createElement("link");
  tag.rel = attrs.rel;
  tag.href = attrs.href;
  if (attrs.hreflang) tag.hreflang = attrs.hreflang;
  tag.setAttribute(MARK, "");
  document.head.appendChild(tag);
}
