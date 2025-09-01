"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Stack,
  Avatar,
  IconButton,
  Chip,
  CircularProgress,
} from "@mui/material";
import { FaPaperPlane, FaArrowLeft, FaUsers } from "react-icons/fa";
import { Message } from "@/types/message";
import { Room } from "@/types/room";
import { useAuth } from "@/contexts/AuthContext";

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
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // エラー状態
  if (error || !room) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
        }}
      >
        <Typography
          variant="h6"
          color="error"
          gutterBottom
          sx={{ color: "#dc2626 !important" }}
        >
          {error || "ルームが見つかりません"}
        </Typography>
        <Button variant="contained" onClick={handleBack} sx={{ mt: 2 }}>
          ルーム一覧に戻る
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ヘッダー */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          borderRadius: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={handleBack}>
            <FaArrowLeft />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ color: "#000000 !important" }}>
              {room.title}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                icon={<FaUsers />}
                label={`${room.members?.length || 0}/${room.capacity || 0}`}
                size="small"
                variant="outlined"
              />
              {room.visibility === "passcode" && (
                <Chip label="パスコード" size="small" color="secondary" />
              )}
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {/* メッセージエリア */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
          bgcolor: "grey.50",
        }}
      >
        <Stack spacing={2}>
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </Stack>
      </Box>

      {/* メッセージ入力エリア */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          borderRadius: 0,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={2} alignItems="end">
          <TextField
            multiline
            maxRows={4}
            fullWidth
            placeholder="メッセージを入力..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sendingMessage}
          />
          <Button
            variant="contained"
            endIcon={<FaPaperPlane />}
            onClick={sendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            sx={{ minWidth: 100 }}
          >
            送信
          </Button>
        </Stack>
      </Paper>
    </Box>
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
    <Box
      sx={{
        display: "flex",
        justifyContent: isOwnMessage ? "flex-end" : "flex-start",
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        {!isOwnMessage && message.user && (
          <Avatar src={message.user.picture} sx={{ width: 40, height: 40 }}>
            {message.user.name?.charAt(0) || "?"}
          </Avatar>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            {!isOwnMessage && message.user && (
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 600, color: "#000000 !important" }}
              >
                {message.user.name || "不明"}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {formatTime(message.created_at)}
            </Typography>
          </Stack>
          <Typography
            variant="body2"
            sx={{
              mt: 0.5,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              color: "#000000 !important",
              textAlign: isOwnMessage ? "right" : "left",
            }}
          >
            {message.content}
          </Typography>
        </Box>
        {isOwnMessage && message.user && (
          <Avatar src={message.user.picture} sx={{ width: 40, height: 40 }}>
            {message.user.name?.charAt(0) || "?"}
          </Avatar>
        )}
      </Stack>
    </Box>
  );
}
