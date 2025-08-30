/**
 * クライアント側のルーム型定義
 */

// === API関連型 ===
export interface RoomResponse {
  id: string;
  title: string;
  visibility: string;
  capacity: number;
  member_count: number;
  created_at: string;
}

// === クライアント用型 ===
export interface Room {
  id: string;
  title: string;
  visibility: "public" | "passcode";
  capacity: number;
  members: RoomMember[];
  created_at: string;
}

export interface RoomMember {
  id: string;
  name: string;
  picture?: string;
}

// ルーム作成・編集用
export interface CreateRoomData {
  title: string;
  visibility: "public" | "passcode";
  passcode?: string;
  capacity: number;
}

export interface JoinRoomData {
  passcode?: string;
}
