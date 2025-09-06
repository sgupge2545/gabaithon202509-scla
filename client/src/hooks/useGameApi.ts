"use client";

import { useCallback, useState, useEffect } from "react";
import {
  GameStatus,
  Question,
  GameState,
  StartQuizRequest,
  AnswerResult,
  GameEvent,
} from "@/types/game";

export function useGameApi(gameId: string | null) {
  const [gameState, setGameState] = useState<GameState>({
    gameStatus: null,
    currentQuestion: null,
    timeRemaining: 0,
    showHint: false,
    error: null,
  });

  const fetchGameStatus = useCallback(async (): Promise<{
    data: GameStatus | null;
    error?: string;
  }> => {
    if (!gameId) return { data: null, error: "no_game_id" };

    try {
      const res = await fetch(`/api/game/status/${gameId}`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { data: null, error: `HTTP_${res.status}` };
      }

      const status: GameStatus = await res.json();
      setGameState((prev) => ({ ...prev, gameStatus: status, error: null }));
      return { data: status };
    } catch {
      const error = "network_error";
      setGameState((prev) => ({ ...prev, error }));
      return { data: null, error };
    }
  }, [gameId]);

  const fetchCurrentQuestion = useCallback(async (): Promise<{
    data: Question | null;
    error?: string;
  }> => {
    if (!gameId) return { data: null, error: "no_game_id" };

    try {
      const res = await fetch(`/api/game/question/${gameId}`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { data: null, error: `HTTP_${res.status}` };
      }

      const data = await res.json();
      const question = data.question as Question;
      setGameState((prev) => ({
        ...prev,
        currentQuestion: question,
        error: null,
      }));
      return { data: question };
    } catch {
      const error = "network_error";
      setGameState((prev) => ({ ...prev, error }));
      return { data: null, error };
    }
  }, [gameId]);

  const startGame = useCallback(async (): Promise<{
    data: boolean;
    error?: string;
  }> => {
    if (!gameId) return { data: false, error: "no_game_id" };

    try {
      const res = await fetch(`/api/game/start/${gameId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { data: false, error: `HTTP_${res.status}` };
      }

      await fetchGameStatus();
      return { data: true };
    } catch {
      const error = "network_error";
      setGameState((prev) => ({ ...prev, error }));
      return { data: false, error };
    }
  }, [gameId, fetchGameStatus]);

  const startQuizGame = useCallback(
    async (
      requestData: StartQuizRequest
    ): Promise<{
      data: { game_id: string; status: string } | null;
      error?: string;
    }> => {
      try {
        const res = await fetch("/api/game/start-quiz", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestData),
        });

        if (!res.ok) {
          return { data: null, error: `HTTP_${res.status}` };
        }

        const data = await res.json();
        return { data };
      } catch {
        return { data: null, error: "network_error" };
      }
    },
    []
  );

  const submitAnswer = useCallback(
    async (
      answer: string
    ): Promise<{
      data: AnswerResult | null;
      error?: string;
    }> => {
      if (!gameId) return { data: null, error: "no_game_id" };

      try {
        const res = await fetch(`/api/game/answer/${gameId}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ answer }),
        });

        if (!res.ok) {
          return { data: null, error: `HTTP_${res.status}` };
        }

        const data = await res.json();
        return { data };
      } catch {
        return { data: null, error: "network_error" };
      }
    },
    [gameId]
  );

  // WebSocketでゲーム状態を更新
  const updateGameStateFromWebSocket = useCallback(
    (data: GameEvent, onGradingResult?: (data: GameEvent) => void) => {
      if (data.type === "game_status_update") {
        setGameState((prev) => ({
          ...prev,
          gameStatus: data.gameStatus || null,
          error: null,
        }));
      } else if (data.type === "game_question") {
        setGameState((prev) => ({
          ...prev,
          currentQuestion: data.question || null,
          timeRemaining: 20,
          showHint: false,
          error: null,
        }));
      } else if (data.type === "game_hint") {
        setGameState((prev) => ({
          ...prev,
          showHint: true,
          error: null,
        }));
      } else if (data.type === "game_timer") {
        setGameState((prev) => ({
          ...prev,
          timeRemaining: data.timeRemaining || 0,
          error: null,
        }));
      } else if (data.type === "game_grading_result" && onGradingResult) {
        onGradingResult(data);
      }
    },
    []
  );

  // ゲーム状態がreadyになったら自動的にゲームを開始
  useEffect(() => {
    if (gameState.gameStatus?.status === "ready" && gameId) {
      console.log("Game is ready, starting automatically...");
      startGame();
    }
  }, [gameState.gameStatus?.status, gameId, startGame]);

  // ゲームIDが設定されたら状態をポーリング
  useEffect(() => {
    if (!gameId) return;

    const pollGameStatus = async () => {
      await fetchGameStatus();
    };

    // 初回実行
    pollGameStatus();

    // 問題生成中は定期的にポーリング
    const interval = setInterval(() => {
      if (gameState.gameStatus?.status === "generating") {
        pollGameStatus();
      } else {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [gameId, gameState.gameStatus?.status, fetchGameStatus]);

  return {
    gameState,
    fetchGameStatus,
    fetchCurrentQuestion,
    startGame,
    startQuizGame,
    submitAnswer,
    updateGameStateFromWebSocket,
  };
}
