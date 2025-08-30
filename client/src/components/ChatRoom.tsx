"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Stack,
  Avatar,
  Divider,
  IconButton,
  Chip,
} from "@mui/material";
import { FaPaperPlane, FaArrowLeft, FaUsers } from "react-icons/fa";
import { Message } from "@/types/message";
import { Room } from "@/types/room";

interface ChatRoomProps {
  room: Room;
  onBack: () => void;
}

export function ChatRoom({ room, onBack }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージ一覧を取得
  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/rooms/${room.id}/messages`);
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
    if (!newMessage.trim() || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/rooms/${room.id}/messages`, {
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
      setLoading(false);
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

  useEffect(() => {
    fetchMessages();
  }, [room.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          <IconButton onClick={onBack}>
            <FaArrowLeft />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">{room.title}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                icon={<FaUsers />}
                label={`${room.member_count}/${room.capacity}`}
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
            disabled={loading}
          />
          <Button
            variant="contained"
            endIcon={<FaPaperPlane />}
            onClick={sendMessage}
            disabled={!newMessage.trim() || loading}
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

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Avatar src={message.user?.picture} sx={{ width: 40, height: 40 }}>
          {message.user?.name?.charAt(0) || "?"}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {message.user?.name || "不明"}
            </Typography>
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
            }}
          >
            {message.content}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
