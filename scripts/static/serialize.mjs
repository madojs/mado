export function serializeJsonForScript(value, context) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch (err) {
    throw new Error(
      `[mado:static] initialData for ${context} is not JSON-serializable: ${err.message}`,
    );
  }
  if (json === undefined) {
    throw new Error(
      `[mado:static] initialData for ${context} is not JSON-serializable.`,
    );
  }
  return json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function assertJsonSerializable(value, context) {
  serializeJsonForScript(value, context);
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
