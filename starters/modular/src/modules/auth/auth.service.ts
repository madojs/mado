// Canonical *.service.ts shape:
//   1. PRIVATE STATE     — _signals, not exported
//   2. PUBLIC READS      — getters / computed
//   3. ACTIONS           — async functions that mutate state
//   4. (optional) init() — wires interceptors, restores from storage
//
// Services are plain ES modules. The module identity = the singleton.

import { computed, signal } from "@madojs/mado";

import { registerAuthTokenProvider } from "../../shared/http/interceptors";

import { authApi } from "./auth.connector";
import type { Credentials, User } from "./auth.types";

// 1. PRIVATE STATE
const _user = signal<User | null>(null);
const _token = signal<string | null>(null);
const _booting = signal(true);

const TOKEN_KEY = "mado.auth.token";

// 2. PUBLIC READS
//   Note: Mado signals are getter functions — read with `_user()`, write with
//   `_user.set(value)` or `_user.update(fn)`. There is no `_user.value`.
export const user = (): User | null => _user();
export const token = (): string | null => _token();
export const isAuthed = computed(() => _user() !== null);
export const isBooting = (): boolean => _booting();

export const hasRole = (role: string): boolean => _user()?.roles.includes(role) ?? false;
export const hasPermission = (perm: string): boolean =>
  _user()?.permissions.includes(perm) ?? false;

// 3. ACTIONS
export async function login(creds: Credentials): Promise<void> {
  const { token: t, user: u } = await authApi.login(creds);
  localStorage.setItem(TOKEN_KEY, t);
  _token.set(t);
  _user.set(u);
}

export async function logout(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    /* ignore network errors on logout */
  }
  localStorage.removeItem(TOKEN_KEY);
  _token.set(null);
  _user.set(null);
}

// 4. INIT
// Called from main.ts at startup. Restores token, refetches user, wires the
// HTTP auth interceptor.
export async function init(): Promise<void> {
  registerAuthTokenProvider(() => _token());

  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) {
    _token.set(saved);
    try {
      _user.set(await authApi.me());
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      _token.set(null);
    }
  }
  _booting.set(false);
}