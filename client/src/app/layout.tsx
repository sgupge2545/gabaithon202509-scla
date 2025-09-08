import AuthGuard from "@/components/AuthGuard";
import { AuthProvider } from "@/contexts/AuthContext";
import { RoomProvider } from "@/contexts/RoomContext";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ludus",
  description: "リアルタイムチャットアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <RoomProvider>
            <AuthGuard>{children}</AuthGuard>
          </RoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
