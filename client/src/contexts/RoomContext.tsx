"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Room, CreateRoomData, JoinRoomData } from "@/types/room";
import { useRoomApi } from "@/hooks/useRoomApi";
import { useRoomsSocket, RoomsEvent } from "@/hooks/useRoomsSocket";

interface RoomContextType {
  // 状態
  publicRooms: Room[];
  currentRoom: Room | null;
  selectedRoom: Room | null;
  loading: boolean;
  initialized: boolean;

  // アクション
  fetchPublicRooms: () => Promise<void>;
  createRoom: (roomData: CreateRoomData) => Promise<Room | null>;
  joinRoom: (roomId: string, joinData?: JoinRoomData) => Promise<boolean>;
  leaveRoom: (roomId: string) => Promise<boolean>;
  setCurrentRoom: (roomId: string) => Promise<void>;
  clearCurrentRoom: () => void;
  selectRoom: (room: Room) => void;
  clearSelectedRoom: () => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function useRoom() {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
}

interface RoomProviderProps {
  children: React.ReactNode;
}

export function RoomProvider({ children }: RoomProviderProps) {
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoomState] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const roomApi = useRoomApi();

  const fetchPublicRooms = async () => {
    setLoading(true);
    const { data } = await roomApi.getPublicRooms();
    if (data) {
      setPublicRooms(data);
    }
    setLoading(false);
  };

  const createRoom = async (roomData: CreateRoomData): Promise<Room | null> => {
    setLoading(true);
    const { data } = await roomApi.createRoom(roomData);

    if (data) {
      setPublicRooms((prev) => {
        if (!(data.visibility === "public" || data.visibility === "passcode")) {
          return prev;
        }
        if (prev.some((r) => r.id === data.id)) {
          return prev;
        }
        return [data, ...prev];
      });
    }

    setLoading(false);
    return data;
  };

  const joinRoom = async (
    roomId: string,
    joinData: JoinRoomData = {}
  ): Promise<boolean> => {
    setLoading(true);
    const { error } = await roomApi.joinRoom(roomId, joinData);
    setLoading(false);

    if (!error) {
      // 参加成功後、ルーム詳細を取得
      await setCurrentRoom(roomId);
      return true;
    }

    return false;
  };

  const leaveRoom = async (roomId: string): Promise<boolean> => {
    setLoading(true);
    const { error } = await roomApi.leaveRoom(roomId);
    setLoading(false);

    if (!error) {
      // 退出後、現在のルームをクリア
      if (currentRoom?.id === roomId) {
        setCurrentRoomState(null);
      }
      try {
        localStorage.removeItem("currentRoomId");
      } catch {}
      // 公開ルーム一覧を更新
      await fetchPublicRooms();
      return true;
    }

    return false;
  };

  const setCurrentRoom = async (roomId: string) => {
    setLoading(true);
    const { data } = await roomApi.getRoomDetail(roomId);
    if (data) {
      setCurrentRoomState(data);
      try {
        localStorage.setItem("currentRoomId", roomId);
      } catch {}
    }
    setLoading(false);
  };

  const clearCurrentRoom = () => {
    setCurrentRoomState(null);
    try {
      localStorage.removeItem("currentRoomId");
    } catch {}
  };

  const selectRoom = (room: Room) => {
    setSelectedRoom(room);
  };

  const clearSelectedRoom = () => {
    setSelectedRoom(null);
  };

  // 初期化時に公開ルーム一覧を取得
  useEffect(() => {
    fetchPublicRooms();
  }, []);

  // リロード時に直前のルームを復元
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem("currentRoomId");
        if (saved) {
          await setCurrentRoom(saved);
        }
      } catch {}
      if (!cancelled) setInitialized(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // リアルタイム更新の購読
  useRoomsSocket((ev: RoomsEvent) => {
    if (!ev) return;
    if (ev.type === "room_created") {
      const room = ev.room as Room;
      if (room.visibility === "public" || room.visibility === "passcode") {
        setPublicRooms((prev) => {
          if (prev.some((r) => r.id === room.id)) {
            return prev;
          }
          return [room, ...prev];
        });
      }
    } else if (ev.type === "room_updated") {
      const updated = ev.room;
      setPublicRooms((prev) =>
        prev.map((r) =>
          r.id === updated.id ? { ...r, member_count: updated.member_count } : r
        )
      );
    } else if (ev.type === "room_deleted") {
      setPublicRooms((prev) => prev.filter((r) => r.id !== ev.room_id));
    }
  });

  const value = {
    publicRooms,
    currentRoom,
    selectedRoom,
    loading,
    initialized,
    fetchPublicRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    setCurrentRoom,
    clearCurrentRoom,
    selectRoom,
    clearSelectedRoom,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
