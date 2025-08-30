import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DevContainer用の設定
  webpack: (config, { dev }) => {
    if (dev) {
      // ファイルウォッチングの設定を改善
      config.watchOptions = {
        poll: 1000, // 1秒ごとにファイル変更をチェック
        aggregateTimeout: 300, // 変更検出後300ms待機
        ignored: ["**/node_modules", "**/.git", "**/.next"],
      };
    }
    return config;
  },
};

export default nextConfig;
