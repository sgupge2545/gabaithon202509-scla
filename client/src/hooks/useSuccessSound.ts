"use client";

import { useCallback, useRef } from "react";

export function useSuccessSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSuccessSound = useCallback(() => {
    try {
      // Web Audio APIを使用してプログラム的に音を生成
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }

      const audioContext = audioContextRef.current;

      // 成功音のメロディーを作成
      const notes = [
        { frequency: 523.25, duration: 0.15 }, // C5
        { frequency: 659.25, duration: 0.15 }, // E5
        { frequency: 783.99, duration: 0.15 }, // G5
        { frequency: 1046.5, duration: 0.3 }, // C6
      ];

      let startTime = audioContext.currentTime;

      notes.forEach((note) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(note.frequency, startTime);
        oscillator.type = "sine";

        // エンベロープ（音量の変化）
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          startTime + note.duration
        );

        oscillator.start(startTime);
        oscillator.stop(startTime + note.duration);

        startTime += note.duration * 0.8; // 少し重複させる
      });
    } catch (error) {
      console.log("音声再生をスキップ:", error);
      // 音声が再生できない環境では何もしない
    }
  }, []);

  return { playSuccessSound };
}
