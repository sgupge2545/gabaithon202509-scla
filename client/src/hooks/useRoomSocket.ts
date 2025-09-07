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
  const wsUrlIndexRef = useRef(0); // 0: same-origin proxy, 1: direct backend
  const connectWebSocketRef = useRef<(() => void) | null>(null);
  const onGameEventRef = useRef<((data: GameEvent) => void) | undefined>(
    undefined
  );
  const maxReconnectAttempts = 5; // 試行回数を減らす
  const baseReconnectDelay = 2000; // 2秒に延長

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
    } catch {
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

  useEffect(() => {
    onGameEventRef.current = onGameEvent;
  }, [onGameEvent]);

  // 再接続機能
  const scheduleReconnect = useCallback(() => {
    // 既に接続中または接続試行中なら再接続を予約しない
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error(
        "Max reconnection attempts reached - stopping reconnection"
      );
      setConnected(false);
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
      connectWebSocketRef.current?.();
    }, delay);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!roomId) {
      console.warn("Cannot connect WebSocket: no roomId");
      return;
    }

    // 既存がOPEN/CONNECTINGなら新規接続を開始しない（重複接続防止）
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // 接続候補URL（優先: 同一オリジン -> 失敗時: 直接8000番）
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const sameOrigin = `${protocol}://${window.location.host}/api/rooms/${roomId}/ws`;
    const direct8000 = `${protocol}://${window.location.hostname}:8000/api/rooms/${roomId}/ws`;
    const candidates = [sameOrigin, direct8000];
    const preferDirectOnDev = window.location.port === "3000";
    const wsUrl = preferDirectOnDev
      ? direct8000
      : candidates[wsUrlIndexRef.current] || sameOrigin;

    console.log(
      `Connecting to WebSocket: ${wsUrl} (attempt ${
        reconnectAttemptsRef.current + 1
      })`
    );

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // 接続タイムアウトを設定
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.warn("WebSocket connection timeout");
          ws.close();
          scheduleReconnect();
        }
      }, 5000); // 5秒タイムアウト

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        clearTimeout(connectionTimeout);
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
          if (data.type && data.type.startsWith("game_")) {
            const handler = onGameEventRef.current;
            if (handler) handler(data);
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
        console.log(
          "WebSocket closed:",
          event.code,
          event.reason,
          event.wasClean
        );
        clearTimeout(connectionTimeout);

        // 最新のソケットでない場合は無視
        if (wsRef.current !== ws) {
          return;
        }

        setConnected(false);
        stopHeartbeat();
        wsRef.current = null;

        // 正常なクローズ以外は再接続を試行
        if (event.code !== 1000 && event.code !== 1001) {
          console.log("Scheduling reconnect due to abnormal close");
          if (reconnectAttemptsRef.current >= 2) {
            wsUrlIndexRef.current = Math.min(wsUrlIndexRef.current + 1, 1);
          }
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error details:", {
          error,
          readyState: ws.readyState,
          url: ws.url,
          roomId,
          timestamp: new Date().toISOString(),
        });
        clearTimeout(connectionTimeout);

        // 最新のソケットでない場合は無視
        if (wsRef.current !== ws) {
          return;
        }

        // エラー時の再接続は慎重に判断
        if (ws.readyState === WebSocket.CLOSED) {
          console.log("WebSocket error - scheduling reconnect");
          if (reconnectAttemptsRef.current >= 2) {
            wsUrlIndexRef.current = Math.min(wsUrlIndexRef.current + 1, 1);
          }
          scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      scheduleReconnect();
    }
  }, [roomId, startHeartbeat, stopHeartbeat, scheduleReconnect]);

  // refに関数を設定
  connectWebSocketRef.current = connectWebSocket;

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
      } catch {
        return null;
      }
    },
    [roomId]
  );

  return { messages, sendMessage, connected, loading };
}
