"use client";

import { useCallback } from "react";
import { User, GetCurrentUserResponse, LogoutApiResponse } from "@/types/user";

function mapUserFromApi(response: GetCurrentUserResponse): User {
  return {
    id: String(response.id),
    sub: response.sub,
    email: response.email,
    name: response.name,
    picture: response.picture ?? undefined,
  };
}

export function useAuthApi() {
  const getCurrentUser = useCallback(async (): Promise<{
    data: User | null;
    error?: string;
  }> => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        // 認証エラーの場合はエラーを返すだけ（自動リダイレクトしない）
        return { data: null, error: `HTTP_${res.status}` };
      }

      const json: GetCurrentUserResponse = await res.json();
      const user: User = mapUserFromApi(json);
      return { data: user };
    } catch (error) {
      // CORSエラーやネットワークエラーの場合はエラーを返す
      return { data: null, error: "network_error" };
    }
  }, []);

  const logout = useCallback(async (): Promise<{
    error?: string;
  }> => {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      return { error: `HTTP_${res.status}` };
    }

    const _json: LogoutApiResponse = await res.json();
    return {};
  }, []);

  const login = useCallback((): void => {
    window.location.href = "/api/auth/login";
  }, []);

  return { getCurrentUser, logout, login };
}
