/**
 * Auth signal for the showcase. Minimal on purpose: no sessions/JWT, just a
 * signal storing whether a user is logged in and who they are.
 */

import { signal } from "madojs";
import { api, type User } from "./api.js";

export const currentUser = signal<User | null>(null);

export async function bootAuth(): Promise<void> {
  // On page load, check whether a session already exists (not in this mock).
  const u = await api.me();
  currentUser.set(u);
}

export async function login(email: string, password: string): Promise<void> {
  await api.login(email, password);
  const u = await api.me();
  currentUser.set(u);
}

export async function logout(): Promise<void> {
  await api.logout();
  currentUser.set(null);
}
