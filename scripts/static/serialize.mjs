/**
 * Strict JsonValue validator.
 *
 * Mirrors the public `JsonValue` type from src/page.ts: only null,
 * booleans, finite numbers, strings, plain arrays and plain object trees
 * are allowed. Forbidden shapes (Date, Map, Set, class instances, NaN,
 * Infinity, undefined values, functions, symbols, bigints, cycles,
 * non-plain prototypes) are reported with a path-aware error so a static
 * route author can find the bad field immediately.
 *
 *   [mado:static] /products/keyboard:
 *     seed.product.createdAt is Date; expected JsonValue.
 *
 * `JSON.stringify()` alone is too forgiving — Date coerces to a string,
 * Map serialises as `{}`, undefined fields silently disappear — so the
 * snapshot would look "fine" at build time but mismatch the runtime
 * shape on the first SPA navigation. The custom walker stops the bad
 * value before it ever reaches the snapshot HTML.
 */
function describeNonJson(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "NaN" : "Infinity";
  }
  if (typeof value === "bigint") return "bigint";
  if (typeof value === "symbol") return "symbol";
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return "Array";
  if (value instanceof Date) return "Date";
  if (typeof Map !== "undefined" && value instanceof Map) return "Map";
  if (typeof Set !== "undefined" && value instanceof Set) return "Set";
  if (typeof RegExp !== "undefined" && value instanceof RegExp) return "RegExp";
  if (typeof URL !== "undefined" && value instanceof URL) return "URL";
  if (ArrayBuffer.isView?.(value)) return value.constructor?.name ?? "TypedArray";
  if (value instanceof ArrayBuffer) return "ArrayBuffer";
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      return value.constructor?.name ?? "non-plain object";
    }
    return "object";
  }
  return typeof value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Walk a value and throw on the first non-JsonValue shape. `seen`
 * tracks containers to catch cycles deterministically (Set keyed by
 * identity).
 */
function walkJsonValue(value, path, contextLabel, seen) {
  if (value === null) return;
  const t = typeof value;
  if (t === "boolean" || t === "string") return;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `[mado:static] ${contextLabel}: ${path} is ${
          Number.isNaN(value) ? "NaN" : "Infinity"
        }; expected JsonValue.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error(
        `[mado:static] ${contextLabel}: ${path} contains a circular reference; expected JsonValue.`,
      );
    }
    seen.add(value);
    for (let i = 0; i < value.length; i++) {
      walkJsonValue(value[i], `${path}[${i}]`, contextLabel, seen);
    }
    seen.delete(value);
    return;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      throw new Error(
        `[mado:static] ${contextLabel}: ${path} contains a circular reference; expected JsonValue.`,
      );
    }
    seen.add(value);
    for (const key of Object.keys(value)) {
      const child = value[key];
      // `undefined` would silently disappear through JSON.stringify; we
      // reject it explicitly so the schema stays honest. To omit a field
      // simply do not include the key.
      if (child === undefined) {
        throw new Error(
          `[mado:static] ${contextLabel}: ${path}.${key} is undefined; ` +
            `expected JsonValue. Omit the key instead of assigning undefined.`,
        );
      }
      walkJsonValue(child, `${path}.${key}`, contextLabel, seen);
    }
    seen.delete(value);
    return;
  }
  throw new Error(
    `[mado:static] ${contextLabel}: ${path} is ${describeNonJson(value)}; ` +
      `expected JsonValue.`,
  );
}

/**
 * Throw if `value` is not a strict JsonValue (see walkJsonValue).
 * `contextLabel` is included in every error so the discovery output can
 * point a user at the failing route or pathname.
 */
export function assertJsonSerializable(value, contextLabel) {
  walkJsonValue(value, "seed", contextLabel, new Set());
}

export function serializeJsonForScript(value, contextLabel) {
  assertJsonSerializable(value, contextLabel);
  // The validator guarantees JSON.stringify cannot drop, coerce or
  // silently expand anything, so the resulting string is exactly the
  // shape page.head/load will receive on first client boot.
  const json = JSON.stringify(value);
  if (json === undefined) {
    // Should be unreachable after assertJsonSerializable; defensive.
    throw new Error(
      `[mado:static] ${contextLabel}: top-level value cannot be serialized as JSON.`,
    );
  }
  return json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Prepare the shell HTML for browser capture of a single route.
 *
 * Two CSP-safe markers are injected:
 *   1. `data-mado-static-capture` on the <html> tag — the runtime checks
 *      that attribute (and removes it before serialization) instead of
 *      relying on an inline script that strict CSP would block.
 *   2. `<script type="application/json" data-mado-static-data="${pathname}">`
 *      carrying the build-time seed. The runtime consumes it once, the
 *      serializer preserves it in the final snapshot, and the real client
 *      boot consumes it again on first load.
 *
 * The seed is URL-bound through the `data-mado-static-data` attribute so
 * SPA navigations to other routes (or accidentally cached copies) cannot
 * reuse a stale value.
 */
export function injectSnapshotMode(html, record) {
  let out = setHtmlAttribute(html, "data-mado-static-capture", "");
  if ("initialData" in record) {
    const seedScript =
      `<script type="application/json" data-mado-static-data="${escapeAttr(record.pathname)}">` +
      serializeJsonForScript(record.initialData, record.pathname) +
      `</script>`;
    out = injectAfterHeadOpen(out, seedScript);
  }
  return out;
}

function setHtmlAttribute(html, name, value) {
  const match = /<html\b([^>]*)>/i.exec(html);
  if (!match) return html;
  const attrs = match[1] ?? "";
  if (new RegExp(`\\b${name}\\b`, "i").test(attrs)) return html;
  const replacement = `<html${attrs} ${name}="${escapeAttr(value)}">`;
  return html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function addNoIndex(html) {
  if (/<meta\s+[^>]*(?:name=["']robots["']|content=["'][^"']*noindex)/i.test(html)) {
    return html;
  }
  return injectAfterHeadOpen(
    html,
    `<meta name="robots" content="noindex">`,
  );
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectAfterHeadOpen(html, content) {
  const match = /<head\b[^>]*>/i.exec(html);
  if (!match) return content + html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + content + html.slice(at);
}
