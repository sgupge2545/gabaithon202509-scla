/**
 * クライアント側のユーザー型定義
 * OpenAPI生成型とは別に、クライアントで扱うユーザー情報を定義
 */

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
