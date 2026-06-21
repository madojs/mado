// Raw DTOs of the auth backend. PRIVATE to this module's connector.
// ESLint prevents these from being imported anywhere else.

export interface LoginRequestDTO {
  email: string;
  password: string;
}

export interface LoginResponseDTO {
  token: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}