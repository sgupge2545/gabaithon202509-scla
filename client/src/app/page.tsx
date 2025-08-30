"use client";

import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">チャットアプリ</h1>
            <div className="flex items-center space-x-4">
              {user?.picture && (
                <Image
                  src={user.picture}
                  alt="プロフィール画像"
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-gray-700">{user?.name}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            ようこそ、{user?.name}さん！
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            チャットアプリにログインしました
          </p>

          <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-4">ユーザー情報</h3>
            <div className="space-y-2 text-left">
              <p>
                <strong>ID:</strong> {user?.id}
              </p>
              <p>
                <strong>Email:</strong> {user?.email}
              </p>
              <p>
                <strong>名前:</strong> {user?.name}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
