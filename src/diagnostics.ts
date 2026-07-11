import { emitDevtools } from "./devtools-hook.js";

/**
 * Internal dev diagnostics.
 *
 * Warnings are intentionally best-effort: they never throw and they are printed
 * once per code so noisy app renders do not flood the console.
 */

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticRecord {
  timestamp: number;
  level: DiagnosticLevel;
  scope: string;
  code: string;
  message: string;
  data?: unknown;
}

const seen = new Set<string>();
const LEVELS: Record<DiagnosticLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

export function reportDiagnostic(
  level: DiagnosticLevel,
  scope: string,
  code: string,
  message: string,
  data?: unknown,
): void {
  if (LEVELS[level] < LEVELS[configuredLevel()]) return;
  const record: DiagnosticRecord = {
    timestamp: Date.now(),
    level,
    scope,
    code,
    message,
    ...(data === undefined ? {} : { data }),
  };
  try {
    const method = level === "debug" ? "debug" : level;
    const colour = level === "error"
      ? "color:#d33;font-weight:600"
      : level === "warn"
        ? "color:#b26a00;font-weight:600"
        : level === "info"
          ? "color:#087ea4"
          : "color:#777";
    const args: unknown[] = [
      `%c[mado:${scope}:${code}]%c ${message}`,
      colour,
      "color:inherit;font-weight:normal",
    ];
    if (data !== undefined) args.push(data);
    console[method](...args);
  } catch {
    /* diagnostics must never affect application behaviour */
  }
  if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) {
    emitDevtools(`diagnostic:${level}`, undefined, record);
  }
  dispatchDiagnostic(record);
}

export function reportError(
  scope: string,
  code: string,
  message: string,
  error: unknown,
): void {
  reportDiagnostic("error", scope, code, message, error);
}

export function warnOnce(code: string, message: string): void {
  if (seen.has(code)) return;
  seen.add(code);
  try {
    reportDiagnostic("warn", "runtime", code, message);
  } catch {
    /* noop */
  }
}

/** @internal */
export const _testHooks = {
  resetWarnings(): void {
    seen.clear();
  },
  seenWarnings(): string[] {
    return [...seen];
  },
};

function configuredLevel(): DiagnosticLevel | "silent" {
  try {
    const value = localStorage.getItem("mado:log-level") ?? "warn";
    if (Object.hasOwn(LEVELS, value)) return value as DiagnosticLevel | "silent";
  } catch {
    /* localStorage is unavailable in Node, workers and locked-down pages */
  }
  return "warn";
}

function dispatchDiagnostic(record: DiagnosticRecord): void {
  try {
    globalThis.dispatchEvent?.(
      new CustomEvent("mado:diagnostic", { detail: record }),
    );
  } catch {
    /* EventTarget/CustomEvent may not exist in non-browser runtimes. */
  }
}
