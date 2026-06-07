/**
 * Theme context: the single source of truth.
 */

import { createContext, type Signal } from "@madojs/mado";

export type Theme = "light" | "dark";

export const ThemeCtx = createContext<Theme>("light");

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

// Convenience type for consumers that inject the context.
export type ThemeSignal = Signal<Theme>;
