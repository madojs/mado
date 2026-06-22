// Domain types exported by the auth module. Never import provider DTOs here.

export type UserId = string;

export interface User {
  id: UserId;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface Credentials {
  email: string;
  password: string;
}