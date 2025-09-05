/**
 * クライアント側のユーザー型定義
 */

// === API関連型 ===
export interface UserResponse {
  id: string;
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface LogoutResponse {
  ok: boolean;
}

// === クライアント用型 ===
export interface User {
  id: string;
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// ユーザーのプロフィール編集用
export interface UserProfileUpdate {
  name: string;
  picture?: string;
}

// === API操作の結果型 ===
export type GetCurrentUserResponse = UserResponse;
export type LogoutApiResponse = LogoutResponse;
