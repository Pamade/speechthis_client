export interface UserRegisterRequest {
  email: string;
  password: string;
  repeatPassword: string;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface RequestPasswordReset {
  token: string;
  password: string;
  repeatPassword: string;
}

export interface AuthResponse {
  access_token?: string;
  error?: string;
  status_code?: string;
  userExists?: string;
  fields?: string;
  email?: string;
  password?: string;
  repeatPassword?: string;
  server?: string;
} 