import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // 画像最適化の設定
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
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
  // API プロキシ設定
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*", // 開発時はlocalhost:8000/api/に転送
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
