/**
 * Internal dev diagnostics.
 *
 * Warnings are intentionally best-effort: they never throw and they are printed
 * once per code so noisy app renders do not flood the console.
 */

const seen = new Set<string>();

export function warnOnce(code: string, message: string): void {
  if (seen.has(code)) return;
  seen.add(code);
  try {
    // eslint-disable-next-line no-console
    console.warn(`[mado:${code}] ${message}`);
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
