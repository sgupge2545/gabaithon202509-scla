"use client";

import { useEffect, useRef } from "react";

export type RoomsEvent =
  | { type: "room_created"; room: any }
  | { type: "room_updated"; room: { id: string; member_count: number } }
  | { type: "room_deleted"; room_id: string };

export function useRoomsSocket(onEvent?: (ev: RoomsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const wsUrl = `${protocol}://${host}/api/rooms/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as RoomsEvent;
        if (onEvent) onEvent(payload);
      } catch (e) {
        // ignore
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [onEvent]);
}
