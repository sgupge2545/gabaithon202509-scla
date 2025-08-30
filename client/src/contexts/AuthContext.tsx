"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthApi } from "@/hooks/useAuthApi";
import { User } from "@/types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { login: loginApi, logout: logoutApi, getCurrentUser } = useAuthApi();

  const login = () => {
    loginApi();
  };

  const logout = async () => {
    const { error } = await logoutApi();
    if (!error) {
      setUser(null);
    } else {
      console.error("ログアウトエラー:", error);
    }
  };

  const refreshUser = async () => {
    const { data, error } = await getCurrentUser();

    if (data) {
      // 生成型からクライアント型に変換
      const user: User = {
        id: data.id,
        sub: data.sub,
        email: data.email,
        name: data.name,
        picture: data.picture || undefined,
      };
      setUser(user);
    } else {
      // 未認証は正常な状態なのでエラーログを出さない
      setUser(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
