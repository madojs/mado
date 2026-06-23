// Canonical *.connector.ts shape:
//   1. CONFIG    — base URL, version flags
//   2. MAPPERS   — DTO → domain (pure functions, tested in isolation)
//   3. ENDPOINTS — thin, return domain types
//   4. ERRORS    — provider-specific subclasses of HttpError (optional)
//
// Connectors NEVER import signals, resources, html, or pages.

import { httpClient } from "../../shared/http/http-client";
import { HttpError } from "../../shared/http/http-error";

import type { LoginRequestDTO, LoginResponseDTO } from "./_contracts/auth-api.types";
import type { Credentials, User } from "./auth.types";

// 1. CONFIG
const base = "/api/auth";

// 2. MAPPERS
const toUser = (dto: LoginResponseDTO["user"]): User => ({
  id: dto.id,
  email: dto.email,
  roles: dto.roles,
  permissions: dto.permissions,
});

// 3. ENDPOINTS
export const authApi = {
  login: async (creds: Credentials): Promise<{ token: string; user: User }> => {
    const req: LoginRequestDTO = { email: creds.email, password: creds.password };
    const res = await httpClient.post<LoginResponseDTO>(`${base}/login`, req);
    return { token: res.token, user: toUser(res.user) };
  },

  me: async (): Promise<User> => {
    const res = await httpClient.get<LoginResponseDTO["user"]>(`${base}/me`);
    return toUser(res);
  },

  logout: (): Promise<void> => httpClient.post<void>(`${base}/logout`),
};

// 4. ERRORS
export class AuthError extends HttpError {
  override readonly name = "AuthError";
}