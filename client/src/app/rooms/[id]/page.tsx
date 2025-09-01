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

  const roomId = params?.id as string;
  const { user } = useAuth();

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
      <div className="flex-1 overflow-auto p-4 bg-muted/30">
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* メッセージ入力エリア */}
      <div className="p-4 bg-muted/30 border-t">
        <div className="flex items-end space-x-2">
          <Textarea
            placeholder="メッセージを入力..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sendingMessage}
            className="min-h-[40px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            className="min-w-[100px]"
          >
            <FaPaperPlane className="h-4 w-4 mr-2" />
            送信
          </Button>
        </div>
      </div>
    </div>
  );
}

// メッセージアイテムコンポーネント
function MessageItem({ message }: { message: Message }) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const { user } = useAuth();
  const isOwnMessage = message.user?.id === user?.id;

  return (
    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      <div className="flex items-start space-x-3 max-w-[70%]">
        {!isOwnMessage && message.user && (
          <Avatar className="w-10 h-10">
            <AvatarImage src={message.user.picture || "/placeholder.svg"} />
            <AvatarFallback>
              {message.user.name?.charAt(0) || "?"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline space-x-2 mb-1">
            {!isOwnMessage && message.user && (
              <span className="text-sm font-semibold">
                {message.user.name || "不明"}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatTime(message.created_at)}
            </span>
          </div>
          <div
            className={`text-sm whitespace-pre-wrap break-words ${
              isOwnMessage ? "text-right" : "text-left"
            }`}
          >
            {message.content}
          </div>
        </div>
        {isOwnMessage && message.user && (
          <Avatar className="w-10 h-10">
            <AvatarImage src={message.user.picture || "/placeholder.svg"} />
            <AvatarFallback>
              {message.user.name?.charAt(0) || "?"}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
