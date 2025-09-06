"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/types/message";
import type { GameEvent } from "@/types/game";

export function useRoomSocket(
  roomId?: string,
  onGameEvent?: (data: GameEvent) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1秒

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const ordered = data.reverse();
        setMessages(ordered);
        messagesRef.current = ordered;
      }
    } catch (e) {
      // ignore network errors here
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // ハートビート機能
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
        } catch (e) {
          console.warn("Failed to send heartbeat:", e);
        }
      }
    }, 30000); // 30秒間隔
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // 再接続機能
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    const delay = Math.min(
      baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
      30000 // 最大30秒
    );

    console.log(
      `Scheduling reconnect in ${delay}ms (attempt ${
        reconnectAttemptsRef.current + 1
      })`
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++;
      connectWebSocket();
    }, delay);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!roomId) return;

    // 既存の接続をクリーンアップ
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const wsUrl = `${protocol}://${host}/api/rooms/${roomId}/ws`;

    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
      reconnectAttemptsRef.current = 0; // 成功時にリセット
      startHeartbeat();
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        // ハートビート応答は無視
        if (data.type === "pong") {
          return;
        }

        // ゲームイベントの場合
        if (data.type && data.type.startsWith("game_") && onGameEvent) {
          onGameEvent(data);
          return;
        }

        // 通常のメッセージの場合
        if (data.type === "message") {
          const payload = data.message as Message;
          const exists = messagesRef.current.find((m) => m.id === payload.id);
          if (!exists) {
            const next = [...messagesRef.current, payload];
            messagesRef.current = next;
            setMessages(next);
          }
        } else {
          // 旧形式のメッセージ（後方互換性）
          const payload = data as Message;
          const exists = messagesRef.current.find((m) => m.id === payload.id);
          if (!exists) {
            const next = [...messagesRef.current, payload];
            messagesRef.current = next;
            setMessages(next);
          }
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setConnected(false);
      stopHeartbeat();

      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      // 正常なクローズ以外は再接続を試行
      if (event.code !== 1000 && event.code !== 1001) {
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, [roomId, onGameEvent, startHeartbeat, stopHeartbeat, scheduleReconnect]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!roomId) return;

    // WebSocket接続を開始
    connectWebSocket();

    return () => {
      // クリーンアップ
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      stopHeartbeat();

      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "Component unmounting");
        } catch (e) {
          console.warn("Error closing WebSocket:", e);
        }
        wsRef.current = null;
      }

      setConnected(false);
    };
  }, [roomId, connectWebSocket, stopHeartbeat]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId || !content.trim()) return null;
      try {
        const res = await fetch(`/api/rooms/${roomId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content }),
        });
        if (!res.ok) return null;
        const sent = await res.json();
        const exists = messagesRef.current.find((m) => m.id === sent.id);
        if (!exists) {
          const next = [...messagesRef.current, sent];
          messagesRef.current = next;
          setMessages(next);
        }
        return sent;
      } catch (e) {
        return null;
      }
    },
    [roomId]
  );

  return { messages, sendMessage, connected, loading };
}
