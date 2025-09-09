"use client";

import { useEffect, useState } from "react";

interface SuccessAnimationProps {
  isActive: boolean;
  score?: number;
  onComplete?: () => void;
}

export default function SuccessAnimation({
  isActive,
  score = 10,
  onComplete,
}: SuccessAnimationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<
    "enter" | "celebrate" | "exit"
  >("enter");

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setAnimationPhase("enter");

      // アニメーションフェーズの制御
      const enterTimer = setTimeout(() => {
        setAnimationPhase("celebrate");
      }, 200);

      const celebrateTimer = setTimeout(() => {
        setAnimationPhase("exit");
      }, 2000);

      const exitTimer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 2800);

      return () => {
        clearTimeout(enterTimer);
        clearTimeout(celebrateTimer);
        clearTimeout(exitTimer);
      };
    }
  }, [isActive, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-40">
      {/* 背景のオーバーレイ */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          animationPhase === "enter" || animationPhase === "celebrate"
            ? "opacity-30"
            : "opacity-0"
        }`}
      />

      {/* メイン演出 */}
      <div
        className={`relative flex flex-col items-center justify-center transform transition-all duration-500 ${
          animationPhase === "enter"
            ? "scale-0 opacity-0"
            : animationPhase === "celebrate"
            ? "scale-100 opacity-100 animate-bounce"
            : "scale-110 opacity-0"
        }`}
      >
        {/* 正解メッセージ */}
        <div className="text-center mb-4">
          <div className="text-6xl mb-2 animate-pulse">🎉</div>
          <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
            正解！
          </h2>
          <div className="text-2xl font-semibold text-yellow-300 drop-shadow-md">
            +{score}点
          </div>
        </div>

        {/* 光る円形エフェクト */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-32 h-32 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 opacity-20 animate-ping ${
              animationPhase === "celebrate" ? "block" : "hidden"
            }`}
          />
          <div
            className={`w-24 h-24 rounded-full bg-gradient-to-r from-green-400 to-blue-500 opacity-30 animate-ping animation-delay-200 ${
              animationPhase === "celebrate" ? "block" : "hidden"
            }`}
          />
        </div>

        {/* キラキラエフェクト */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`absolute text-2xl animate-bounce ${
                animationPhase === "celebrate" ? "block" : "hidden"
              }`}
              style={{
                left: `${20 + i * 10}%`,
                top: `${30 + (i % 3) * 20}%`,
                animationDelay: `${i * 100}ms`,
                animationDuration: "1s",
              }}
            >
              ✨
            </div>
          ))}
        </div>
      </div>

      {/* 追加のエフェクト要素 */}
      <div className="absolute inset-0 overflow-hidden">
        {/* 上から降ってくる星 */}
        {[...Array(6)].map((_, i) => (
          <div
            key={`star-${i}`}
            className={`absolute text-yellow-300 text-xl ${
              animationPhase === "celebrate" ? "animate-bounce" : "hidden"
            }`}
            style={{
              left: `${10 + i * 15}%`,
              top: "10%",
              animationDelay: `${i * 150}ms`,
              animationDuration: "2s",
            }}
          >
            ⭐
          </div>
        ))}

        {/* 左右から飛んでくるハート */}
        <div
          className={`absolute left-0 top-1/2 text-pink-400 text-2xl transform -translate-y-1/2 ${
            animationPhase === "celebrate" ? "animate-pulse" : "hidden"
          }`}
        >
          💖
        </div>
        <div
          className={`absolute right-0 top-1/2 text-pink-400 text-2xl transform -translate-y-1/2 ${
            animationPhase === "celebrate" ? "animate-pulse" : "hidden"
          }`}
        >
          💖
        </div>
      </div>
    </div>
  );
}
