/**
 * Applying HeadMeta to document.<head> in SPA runtime.
 *
 * Approach: we mark all tags we create with the `data-mado-head` attribute.
 * On the next `applyHead` we first remove all ours, then insert the new ones.
 * Existing unrelated metadata from index.html is left alone. Known singleton
 * values (description, canonical, robots, Open Graph and Twitter cards) are
 * replaced so a shell fallback cannot compete with route-owned metadata.
 *
 * For strict static HTML + SPA navigation: also mark static head tags with
 * `data-mado-head="static"`, then the first applyHead removes and replaces them.
 */

import type { HeadMeta } from "./page.js";
import { serializeJsonForScript } from "./json.js";
import { appBase, routeUrl } from "./router/base.js";

const MARK = "data-mado-head";
const publicOrigins = new WeakMap<Document, string>();

export function applyHead(meta: HeadMeta): void {
  // Read the public origin from a captured canonical before removing the
  // static tags. This keeps a configured production `site` stable when a
  // snapshot is previewed on localhost, while ordinary SPA documents fall
  // back to their current origin.
  const publicOrigin = resolvePublicOrigin();

  // 1) remove our previous tags
  for (const el of document.head.querySelectorAll(`[${MARK}]`)) {
    el.remove();
  }

  // 2) title — separately
  if (meta.title) document.title = meta.title;

  // 3) description / canonical
  if (meta.description) {
    upsertMeta({ name: "description", content: meta.description }, true);
  }
  if (meta.canonical) {
    upsertLink(
      {
        rel: "canonical",
        href: normalizeHeadUrl(meta.canonical, publicOrigin),
      },
      true,
    );
  }

  // 4) OG
  if (meta.og) {
    const og = meta.og;
    if (og.title) upsertMeta({ property: "og:title", content: og.title }, true);
    if (og.description)
      upsertMeta(
        { property: "og:description", content: og.description },
        true,
      );
    if (og.image)
      upsertMeta({ property: "og:image", content: og.image }, true);
    if (og.type) upsertMeta({ property: "og:type", content: og.type }, true);
    if (og.url)
      upsertMeta(
        {
          property: "og:url",
          content: normalizeHeadUrl(og.url, publicOrigin),
        },
        true,
      );
  }

  // 5) Twitter (inherits og.* if not set)
  if (meta.twitter || meta.og) {
    const tw = meta.twitter ?? {};
    const og = meta.og ?? {};
    upsertMeta(
      { name: "twitter:card", content: tw.card ?? "summary" },
      true,
    );
    if (tw.title ?? og.title)
      upsertMeta(
        { name: "twitter:title", content: tw.title ?? og.title! },
        true,
      );
    if (tw.description ?? og.description)
      upsertMeta(
        {
          name: "twitter:description",
          content: tw.description ?? og.description!,
        },
        true,
      );
    if (tw.image ?? og.image)
      upsertMeta(
        { name: "twitter:image", content: tw.image ?? og.image! },
        true,
      );
  }

  // 6) Arbitrary meta
  for (const m of meta.meta ?? []) {
    upsertMeta(
      m.property?.toLowerCase() === "og:url"
        ? { ...m, content: normalizeHeadUrl(m.content, publicOrigin) }
        : m,
      isKnownMetaSingleton(m),
    );
  }

  // 7) Arbitrary link
  for (const l of meta.link ?? []) {
    const canonical = hasRel(l.rel, "canonical");
    upsertLink(
      canonical
        ? { ...l, href: normalizeHeadUrl(l.href, publicOrigin) }
        : l,
      canonical,
    );
  }

  // 8) JSON-LD (Schema.org)
  if (meta.jsonLd != null) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(MARK, "");
    script.textContent = serializeJsonForScript(meta.jsonLd);
    document.head.appendChild(script);
  }
}

function upsertMeta(attrs: {
  name?: string;
  property?: string;
  content: string;
}, replaceExisting = false) {
  if (replaceExisting) {
    const selector = metaSelector(attrs);
    if (selector) {
      for (const tag of document.head.querySelectorAll(selector)) tag.remove();
    }
  }
  const tag = document.createElement("meta");
  if (attrs.name) tag.setAttribute("name", attrs.name);
  if (attrs.property) tag.setAttribute("property", attrs.property);
  tag.setAttribute("content", attrs.content);
  tag.setAttribute(MARK, "");
  document.head.appendChild(tag);
}

function upsertLink(
  attrs: { rel: string; href: string; hreflang?: string },
  replaceExisting = false,
) {
  if (replaceExisting && hasRel(attrs.rel, "canonical")) {
    for (const tag of document.head.querySelectorAll(
      'link[rel~="canonical" i]',
    )) {
      tag.remove();
    }
  }
  const tag = document.createElement("link");
  tag.rel = attrs.rel;
  tag.href = attrs.href;
  if (attrs.hreflang) tag.hreflang = attrs.hreflang;
  tag.setAttribute(MARK, "");
  document.head.appendChild(tag);
}

function isKnownMetaSingleton(attrs: {
  name?: string;
  property?: string;
}): boolean {
  const name = attrs.name?.toLowerCase();
  const property = attrs.property?.toLowerCase();
  return (
    name === "description" ||
    name === "robots" ||
    name === "twitter:card" ||
    name === "twitter:title" ||
    name === "twitter:description" ||
    name === "twitter:image" ||
    property === "og:title" ||
    property === "og:description" ||
    property === "og:image" ||
    property === "og:type" ||
    property === "og:url"
  );
}

function metaSelector(attrs: {
  name?: string;
  property?: string;
}): string | null {
  if (attrs.name) return `meta[name="${attrs.name.toLowerCase()}" i]`;
  if (attrs.property) {
    return `meta[property="${attrs.property.toLowerCase()}" i]`;
  }
  return null;
}

function hasRel(value: string, expected: string): boolean {
  return value
    .toLowerCase()
    .split(/\s+/)
    .includes(expected);
}

function resolvePublicOrigin(): string {
  for (const value of [
    document.head
      .querySelector('meta[property="og:url" i][data-mado-head="static"]')
      ?.getAttribute("content"),
    document.head
      .querySelector('link[rel~="canonical" i][data-mado-head="static"]')
      ?.getAttribute("href"),
  ]) {
    const origin = httpOrigin(value);
    if (origin) {
      publicOrigins.set(document, origin);
      return origin;
    }
  }

  const remembered = publicOrigins.get(document);
  if (remembered) return remembered;

  const current = httpOrigin(globalThis.location?.href) ?? location.origin;
  publicOrigins.set(document, current);
  return current;
}

function httpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, globalThis.location?.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeHeadUrl(value: string, publicOrigin: string): string {
  const raw = value.trim();
  if (!raw) return raw;

  try {
    const isCapture = document.documentElement.hasAttribute(
      "data-mado-static-capture",
    );
    if (isCapture && raw.startsWith("/") && !raw.startsWith("//")) {
      return routeUrl(raw, appBase);
    }

    let resolved: URL;
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      resolved = new URL(routeUrl(raw, appBase), `${publicOrigin}/`);
    } else {
      const current = new URL(globalThis.location?.href ?? `${publicOrigin}/`);
      current.protocol = new URL(`${publicOrigin}/`).protocol;
      current.host = new URL(`${publicOrigin}/`).host;
      resolved = new URL(raw, current);
    }

    // During snapshot capture the browser runs on an internal localhost
    // origin. Keep same-origin values route-relative so the serializer can
    // replace that origin with the configured public `site`.
    if (isCapture && resolved.origin === location.origin) {
      return resolved.pathname + resolved.search + resolved.hash;
    }
    return resolved.href;
  } catch {
    return raw;
  }
}
