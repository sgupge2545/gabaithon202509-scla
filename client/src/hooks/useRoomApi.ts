"use client";

import { useCallback } from "react";
import { Room, CreateRoomData, JoinRoomData } from "@/types/room";

export function useRoomApi() {
  const createRoom = useCallback(
    async (
      roomData: CreateRoomData
    ): Promise<{
      data: Room | null;
      error?: string;
    }> => {
      try {
        const res = await fetch("/api/rooms/create", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(roomData),
        });

        if (!res.ok) {
          return { data: null, error: `HTTP_${res.status}` };
        }

        const room: Room = await res.json();
        return { data: room };
      } catch {
        return { data: null, error: "network_error" };
      }
    },
    []
  );

  const getPublicRooms = useCallback(async (): Promise<{
    data: Room[] | null;
    error?: string;
  }> => {
    try {
      const res = await fetch("/api/rooms/public", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { data: null, error: `HTTP_${res.status}` };
      }

      const rooms: Room[] = await res.json();
      return { data: rooms };
    } catch {
      return { data: null, error: "network_error" };
    }
  }, []);

  const getRoomDetail = useCallback(
    async (
      roomId: string
    ): Promise<{
      data: Room | null;
      error?: string;
    }> => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          return { data: null, error: `HTTP_${res.status}` };
        }

        const room: Room = await res.json();
        return { data: room };
      } catch {
        return { data: null, error: "network_error" };
      }
    },
    []
  );

  const joinRoom = useCallback(
    async (
      roomId: string,
      joinData: JoinRoomData
    ): Promise<{
      error?: string;
    }> => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(joinData),
        });

        if (!res.ok) {
          return { error: `HTTP_${res.status}` };
        }

        return {};
      } catch {
        return { error: "network_error" };
      }
    },
    []
  );

  const leaveRoom = useCallback(
    async (
      roomId: string
    ): Promise<{
      error?: string;
    }> => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/leave`, {
          method: "DELETE",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          return { error: `HTTP_${res.status}` };
        }

        return {};
      } catch {
        return { error: "network_error" };
      }
    },
    []
  );

  return {
    createRoom,
    getPublicRooms,
    getRoomDetail,
    joinRoom,
    leaveRoom,
  };
}
