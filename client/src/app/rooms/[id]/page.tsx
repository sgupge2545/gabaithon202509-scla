"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { FaPaperPlane, FaArrowLeft, FaUsers } from "react-icons/fa";
import type { Message } from "@/types/message";
import type { Room } from "@/types/room";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth(); // Declare the user variable here

  const roomId = params?.id as string;

  // ルーム情報を取得
  useEffect(() => {
    const fetchRoom = async () => {
      if (!roomId) return;

      try {
        const response = await fetch(`/api/rooms/${roomId}`, {
          credentials: "include",
        });

        if (response.ok) {
          const roomData = await response.json();
          setRoom(roomData);
        } else {
          setError("ルームが見つかりません");
        }
      } catch (error) {
        setError("ルーム情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId]);

  // メッセージ一覧を取得
  const fetchMessages = async () => {
    if (!roomId) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.reverse()); // 古い順に並び替え
      }
    } catch (error) {
      console.error("メッセージ取得エラー:", error);
    }
  };

  // メッセージ送信
  const sendMessage = async () => {
    if (!newMessage.trim() || sendingMessage || !roomId) return;

    setSendingMessage(true);
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ content: newMessage }),
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages((prev) => [...prev, sentMessage]);
        setNewMessage("");
      }
    } catch (error) {
      console.error("メッセージ送信エラー:", error);
    } finally {
      setSendingMessage(false);
    }
  };

  // Enterキーでメッセージ送信
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 最新メッセージまでスクロール
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ルーム情報取得後にメッセージを取得
  useEffect(() => {
    if (room) {
      fetchMessages();
    }
  }, [room]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleBack = () => {
    router.push("/rooms");
  };

  // ローディング状態
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // エラー状態
  if (error || !room) {
    return (
      <div className="flex justify-center items-center h-screen flex-col">
        <h2 className="text-xl font-semibold text-destructive mb-4">
          {error || "ルームが見つかりません"}
        </h2>
        <Button onClick={handleBack}>ルーム一覧に戻る</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* ヘッダー */}
      <Card className="rounded-none border-b border-t-0 border-l-0 border-r-0">
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <FaArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{room.title}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <Badge
                  variant="outline"
                  className="flex items-center space-x-1"
                >
                  <FaUsers className="h-3 w-3" />
                  <span>
                    {room.members?.length || 0}/{room.capacity || 0}
                  </span>
                </Badge>
                {room.visibility === "passcode" && (
                  <Badge variant="secondary">パスコード</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-auto p-2 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="space-y-3">
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];
            const showAvatar =
              !prevMessage || prevMessage.user?.id !== message.user?.id;
            const showName = showAvatar && !isOwnMessage(message, user);

            return (
              <MessageItem
                key={message.id}
                message={message}
                showAvatar={showAvatar}
                showName={showName}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* メッセージ入力エリア */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <Textarea
              placeholder="メッセージを入力..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendingMessage}
              className="min-h-[44px] max-h-32 resize-none rounded-2xl border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 pr-12"
              rows={1}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            className="h-11 w-11 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            size="icon"
          >
            <FaPaperPlane className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isOwnMessage(message: Message, user: { id?: string } | null) {
  return message.user?.id === user?.id;
}

// メッセージアイテムコンポーネント
function MessageItem({
  message,
  showAvatar = true,
  showName = true,
}: {
  message: Message;
  showAvatar?: boolean;
  showName?: boolean;
}) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const { user } = useAuth();
  const isOwnMessageFunc = isOwnMessage(message, user);

  return (
    <div
      className={`flex ${
        isOwnMessageFunc ? "justify-end" : "justify-start"
      } mb-1 px-2`}
    >
      <div className="flex items-end max-w-[75%]">
        {/* アバター */}
        <div
          className={`flex-shrink-0 ${
            isOwnMessageFunc ? "order-2 ml-2" : "order-1 mr-2"
          }`}
        >
          {showAvatar && message.user ? (
            <Avatar className="w-8 h-8">
              <AvatarImage src={message.user.picture || "/placeholder.svg"} />
              <AvatarFallback
                className={`text-xs ${
                  isOwnMessageFunc
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                {message.user.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>

        {/* メッセージバブル */}
        <div
          className={`flex flex-col ${
            isOwnMessageFunc ? "order-1" : "order-2"
          }`}
        >
          {/* ユーザー名 */}
          {showName && !isOwnMessageFunc && message.user && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 ml-3">
              {message.user.name || "不明"}
            </div>
          )}

          {/* メッセージ内容 */}
          <div
            className={`relative px-4 py-2 rounded-2xl max-w-md break-words ${
              isOwnMessageFunc
                ? "bg-blue-500 text-white rounded-br-md"
                : "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-bl-md"
            }`}
          >
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>

            {/* 時刻表示 */}
            <div
              className={`text-xs mt-1 ${
                isOwnMessageFunc
                  ? "text-blue-100"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {formatTime(message.created_at)}
            </div>

            {/* バブルの矢印 */}
            <div
              className={`absolute top-4 w-0 h-0 ${
                isOwnMessageFunc
                  ? "right-0 translate-x-1 border-l-8 border-l-blue-500 border-t-4 border-t-transparent border-b-4 border-b-transparent"
                  : "left-0 -translate-x-1 border-r-8 border-r-white dark:border-r-slate-700 border-t-4 border-t-transparent border-b-4 border-b-transparent"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
