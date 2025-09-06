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

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!roomId) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const wsUrl = `${protocol}://${host}/api/rooms/${roomId}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

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
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
    };

    ws.onerror = () => {
      /* ignore */
    };

    return () => {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [roomId]);

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
