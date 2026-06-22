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

export function injectSnapshotMode(html, record) {
  const scripts = [
    `<script data-mado-static-mode>window.__MADO_STATIC_MODE__=true;</script>`,
  ];
  if ("initialData" in record) {
    scripts.push(
      `<script type="application/json" data-mado-static-data>` +
        `${serializeJsonForScript(record.initialData, record.pathname)}` +
        `</script>`,
    );
  }
  return injectAfterHeadOpen(html, scripts.join(""));
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
