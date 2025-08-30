/**
 * クライアント側のルーム型定義
 * OpenAPI生成型とは別に、クライアントで扱うルーム情報を定義
 */

export interface Room {
  id: string;
  title: string;
  visibility: "public" | "passcode";
  capacity: number;
  member_count: number;
}

export interface RoomMember {
  id: string;
  name: string;
  picture?: string;
}

export interface RoomDetail extends Room {
  members: RoomMember[];
  created_at: string;
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
