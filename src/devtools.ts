/** Dev-only instrumentation overlay. Import this subpath before app startup. */

import {
  installDevtoolsHook,
  type MadoDevtoolsEvent,
  type MadoDevtoolsHook,
} from "./devtools-hook.js";
import { reportDiagnostic } from "./diagnostics.js";

export type DevtoolsLogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface DevtoolsRecord {
  id: number;
  time: number;
  kind: string;
  targetId?: number;
  data?: unknown;
}

export interface DevtoolsSnapshot {
  version: 1;
  paused: boolean;
  records: DevtoolsRecord[];
}

export interface DevtoolsController {
  open(): void;
  close(): void;
  toggle(): void;
  clear(): void;
  setLogLevel(level: DevtoolsLogLevel): void;
  snapshot(): DevtoolsSnapshot;
}

const MAX_RECORDS = 1_000;
const records: DevtoolsRecord[] = [];
const targetIds = new WeakMap<object, number>();
let nextRecordId = 0;
let nextTargetId = 0;
let paused = false;
let overlay: HTMLElement | null = null;
let renderQueued = false;

const hook: MadoDevtoolsHook = {
  version: 1,
  emit(event) {
    if (paused) return;
    records.push(toRecord(event));
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    queueOverlayRender();
  },
};

installDevtoolsHook(hook);

export const devtools: DevtoolsController = {
  open() {
    if (typeof document === "undefined") return;
    overlay ??= createOverlay();
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);
    overlay.hidden = false;
    renderOverlay();
  },
  close() {
    if (overlay) overlay.hidden = true;
  },
  toggle() {
    if (!overlay || overlay.hidden || !overlay.isConnected) this.open();
    else this.close();
  },
  clear() {
    records.length = 0;
    renderOverlay();
  },
  setLogLevel(level) {
    if (!isLogLevel(level)) throw new TypeError(`Unknown Mado log level: ${level}`);
    try {
      localStorage.setItem("mado:log-level", level);
    } catch {
      /* storage may be disabled */
    }
  },
  snapshot() {
    return {
      version: 1,
      paused,
      records: records.map((record) => ({ ...record })),
    };
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      devtools.toggle();
    }
  });
  try {
    if (localStorage.getItem("madoDebug") === "1") {
      reportDiagnostic(
        "warn",
        "devtools",
        "legacy-debug-flag",
        "localStorage.madoDebug is deprecated; use Alt+Shift+M or devtools.open().",
      );
      devtools.setLogLevel("debug");
      queueMicrotask(() => devtools.open());
    }
  } catch {
    /* storage may be disabled */
  }
}

function toRecord(event: MadoDevtoolsEvent): DevtoolsRecord {
  let targetId: number | undefined;
  if (event.target) {
    targetId = targetIds.get(event.target);
    if (!targetId) {
      targetId = ++nextTargetId;
      targetIds.set(event.target, targetId);
    }
  }
  return {
    id: ++nextRecordId,
    time: event.time,
    kind: event.kind,
    ...(targetId ? { targetId } : {}),
    ...(event.data === undefined ? {} : { data: safePreview(event.data) }),
  };
}

function createOverlay(): HTMLElement {
  const host = document.createElement("aside");
  host.id = "mado-devtools";
  host.setAttribute("aria-label", "Mado developer tools");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${OVERLAY_CSS}</style>
    <header><strong>Mado Devtools</strong><span data-summary></span><button data-close title="Close">×</button></header>
    <nav>
      <button data-tab="overview">Overview</button>
      <button data-tab="reactivity">Reactivity</button>
      <button data-tab="components">Components</button>
      <button data-tab="router-data">Router/Data</button>
      <button data-tab="timeline">Timeline/Errors</button>
    </nav>
    <section class="tools">
      <input data-filter aria-label="Filter events" placeholder="Filter events">
      <button data-pause>Pause</button><button data-clear>Clear</button><button data-copy>Copy snapshot</button>
    </section>
    <main data-content></main>`;
  host.dataset.tab = "overview";
  root.querySelector("[data-close]")?.addEventListener("click", () => devtools.close());
  root.querySelector("[data-clear]")?.addEventListener("click", () => devtools.clear());
  root.querySelector("[data-pause]")?.addEventListener("click", () => {
    paused = !paused;
    renderOverlay();
  });
  root.querySelector("[data-copy]")?.addEventListener("click", () => {
    void navigator.clipboard?.writeText(JSON.stringify(devtools.snapshot(), null, 2));
  });
  root.querySelector("[data-filter]")?.addEventListener("input", () => renderOverlay());
  for (const button of root.querySelectorAll<HTMLElement>("[data-tab]")) {
    button.addEventListener("click", () => {
      host.dataset.tab = button.dataset.tab ?? "overview";
      renderOverlay();
    });
  }
  return host;
}

function queueOverlayRender(): void {
  if (!overlay?.isConnected || overlay.hidden || renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    renderOverlay();
  });
}

function renderOverlay(): void {
  const root = overlay?.shadowRoot;
  if (!root) return;
  const tab = overlay?.dataset.tab ?? "overview";
  const filter = (root.querySelector<HTMLInputElement>("[data-filter]")?.value ?? "").toLowerCase();
  const visible = records.filter((record) => {
    if (!matchesTab(record.kind, tab)) return false;
    return !filter || `${record.kind} ${JSON.stringify(record.data ?? "")}`.toLowerCase().includes(filter);
  });
  const summary = root.querySelector("[data-summary]");
  if (summary) summary.textContent = `${records.length} events · ${paused ? "paused" : "live"}`;
  const pause = root.querySelector("[data-pause]");
  if (pause) pause.textContent = paused ? "Resume" : "Pause";
  const content = root.querySelector("[data-content]");
  if (!content) return;
  if (tab === "overview") {
    const counts = countGroups(records);
    content.innerHTML = `<div class="cards">${Object.entries(counts)
      .map(([name, count]) => `<article><b>${escapeHtml(name)}</b><span>${count}</span></article>`)
      .join("")}</div>`;
    return;
  }
  content.innerHTML = visible.slice(-250).reverse().map((record) => `
    <article class="event ${record.kind.includes("error") ? "error" : ""}">
      <time>${record.time.toFixed(1)}</time><b>${escapeHtml(record.kind)}</b>
      ${record.targetId ? `<i>#${record.targetId}</i>` : ""}
      <code>${escapeHtml(JSON.stringify(record.data ?? ""))}</code>
    </article>`).join("") || `<p class="empty">No matching events</p>`;
}

function matchesTab(kind: string, tab: string): boolean {
  if (tab === "overview") return true;
  if (tab === "reactivity") return /^(signal|computed|effect):/.test(kind);
  if (tab === "components") return kind.startsWith("component:");
  if (tab === "router-data") return /^(router|resource|mutation):/.test(kind);
  return kind.startsWith("diagnostic:") || kind.includes("error");
}

function countGroups(input: DevtoolsRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of input) {
    const group = record.kind.split(":", 1)[0] ?? "other";
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return counts;
}

function safePreview(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (depth >= 2) return `[${Object.prototype.toString.call(value).slice(8, -1)}]`;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safePreview(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Object.keys(result).length >= 20) break;
    result[key] = "value" in descriptor ? safePreview(descriptor.value, depth + 1) : "[Getter]";
  }
  return result;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function isLogLevel(value: string): value is DevtoolsLogLevel {
  return ["debug", "info", "warn", "error", "silent"].includes(value);
}

const OVERLAY_CSS = `
  :host{all:initial;position:fixed;right:12px;bottom:12px;width:min(720px,calc(100vw - 24px));height:min(520px,calc(100vh - 24px));z-index:2147483647;color:#e7e9ee;background:#11141a;border:1px solid #384152;border-radius:12px;box-shadow:0 18px 70px #0009;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;display:grid;grid-template-rows:auto auto auto 1fr;overflow:hidden}
  :host([hidden]){display:none}header{display:flex;gap:12px;align-items:center;padding:10px 12px;background:#1a1f29}header strong{font:600 14px system-ui}header span{color:#929bad;flex:1}button,input{font:inherit;color:inherit;background:#222936;border:1px solid #3a4558;border-radius:6px;padding:5px 8px}button{cursor:pointer}button:hover{background:#30394a}nav,.tools{display:flex;gap:6px;padding:7px 10px;border-top:1px solid #2a3240}.tools input{flex:1}main{overflow:auto;padding:10px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.cards article{display:flex;justify-content:space-between;padding:12px;background:#1b212b;border-radius:8px}.cards span{font-size:18px;color:#77d6a5}.event{display:grid;grid-template-columns:64px 150px 40px 1fr;gap:8px;padding:6px;border-bottom:1px solid #262e3a}.event time,.event i{color:#7f8a9d}.event code{white-space:pre-wrap;overflow-wrap:anywhere;color:#bac3d2}.event.error{background:#4b1f263d;color:#ff9aa8}.empty{color:#8993a4;text-align:center;margin-top:40px}`;
