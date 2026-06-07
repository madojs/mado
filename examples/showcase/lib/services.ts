/**
 * App-level services for the showcase CRM.
 * Demonstrates Mado context without adding a global state manager.
 */

import { createContext, signal, type Signal } from "@madojs/mado";
import { api } from "./api.js";

export type ApiClient = typeof api;

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

export interface ToastService {
  toasts: Signal<Toast[]>;
  push(tone: Toast["tone"], message: string): void;
  remove(id: number): void;
}

let nextToastId = 1;

export function createToastService(): ToastService {
  const toasts = signal<Toast[]>([]);
  return {
    toasts,
    push(tone, message) {
      const id = nextToastId++;
      toasts.update((list) => [...list, { id, tone, message }]);
      setTimeout(() => {
        toasts.update((list) => list.filter((toast) => toast.id !== id));
      }, 3200);
    },
    remove(id) {
      toasts.update((list) => list.filter((toast) => toast.id !== id));
    },
  };
}

export const ApiContext = createContext<ApiClient>(api);
export const ToastContext = createContext<ToastService>(createToastService());
