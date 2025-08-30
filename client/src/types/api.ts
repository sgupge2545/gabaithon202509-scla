/**
 * API関連の型定義
 * OpenAPI生成型から必要な型をエクスポート
 */

import type { components, operations } from "./generated";

// === レスポンス型 ===
export type UserResponse = components["schemas"]["UserResponse"];
export type LogoutResponse = components["schemas"]["LogoutResponse"];

// === エラー型 ===
export interface ErrorResponse {
  error: string;
  detail?: string;
}

// === API操作型 ===
export type GetCurrentUserOperation = operations["me_api_auth_me_get"];
export type LogoutOperation = operations["logout_api_auth_logout_post"];

// === API結果型 ===
export type GetCurrentUserResponse =
  GetCurrentUserOperation["responses"][200]["content"]["application/json"];
export type LogoutApiResponse =
  LogoutOperation["responses"][200]["content"]["application/json"];
