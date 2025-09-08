/**
 * クライアント側のメッセージ型定義
 */

// === API関連型 ===
export interface MessageResponse {
  id: number;
  room_id: string;
  user_id?: string;
  content: string;
  referenced_docs?: { doc_id: string; filename: string }[] | null;
  created_at: string;
  user?: {
    id: string;
    name: string;
    picture?: string;
  } | null;
  grading_result?: {
    is_correct: boolean;
    score: number;
    feedback: string;
    user_name: string;
  } | null;
}

// === クライアント用型 ===
export type Message = MessageResponse;

export interface SendMessageData {
  content: string;
}

// === API操作の結果型 ===
export type GetMessagesResponse = MessageResponse[];
export type SendMessageResponse = MessageResponse;
