"use client";

import React, { useState, ChangeEvent } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { FaPlus, FaUsers, FaLock } from "react-icons/fa";
import { useRoom } from "@/contexts/RoomContext";
import { Room, CreateRoomData } from "@/types/room";

export function RoomList() {
  const { publicRooms, loading, createRoom, joinRoom, selectRoom } = useRoom();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [passcode, setPasscode] = useState("");

  const [newRoom, setNewRoom] = useState<CreateRoomData>({
    title: "",
    visibility: "public",
    passcode: "",
    capacity: 5,
  });

  const handleCreateRoom = async () => {
    if (!newRoom.title.trim()) return;

    const room = await createRoom(newRoom);
    if (room) {
      setCreateDialogOpen(false);
      setNewRoom({
        title: "",
        visibility: "public",
        passcode: "",
        capacity: 5,
      });
      // 作成したルームに自動参加してチャット画面に移動
      const joinSuccess = await joinRoom(room.id);
      if (joinSuccess) {
        selectRoom(room);
      }
    }
  };

  const handleJoinRoom = async (room: Room, needsPasscode: boolean = false) => {
    if (needsPasscode) {
      setSelectedRoomId(room.id);
      setJoinDialogOpen(true);
    } else {
      const success = await joinRoom(room.id);
      if (success) {
        selectRoom(room);
      }
    }
  };

  const handleJoinWithPasscode = async () => {
    const success = await joinRoom(selectedRoomId, { passcode });
    if (success) {
      const room = publicRooms.find((r) => r.id === selectedRoomId);
      if (room) {
        selectRoom(room);
      }
      setJoinDialogOpen(false);
      setPasscode("");
      setSelectedRoomId("");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h4" component="h1">
          チャットルーム
        </Typography>
        <Button
          variant="contained"
          startIcon={<FaPlus />}
          onClick={() => setCreateDialogOpen(true)}
        >
          ルーム作成
        </Button>
      </Stack>

      <Stack spacing={2}>
        {publicRooms.map((room: Room) => (
          <Card key={room.id}>
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography variant="h6" component="h2">
                    {room.title}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Chip
                      icon={<FaUsers />}
                      label={`${room.member_count}/${room.capacity}`}
                      size="small"
                    />
                    {room.visibility === "passcode" && (
                      <Chip
                        icon={<FaLock />}
                        label="パスコード"
                        size="small"
                        color="secondary"
                      />
                    )}
                  </Stack>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() =>
                    handleJoinRoom(room, room.visibility === "passcode")
                  }
                  disabled={room.member_count >= room.capacity}
                >
                  {room.member_count >= room.capacity ? "満室" : "参加"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* ルーム作成ダイアログ */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>新しいルームを作成</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="ルーム名"
              value={newRoom.title}
              onChange={(e) =>
                setNewRoom({ ...newRoom, title: e.target.value })
              }
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>公開設定</InputLabel>
              <Select
                value={newRoom.visibility}
                label="公開設定"
                onChange={(e) =>
                  setNewRoom({
                    ...newRoom,
                    visibility: e.target.value as "public" | "passcode",
                  })
                }
              >
                <MenuItem value="public">公開</MenuItem>
                <MenuItem value="passcode">パスコード</MenuItem>
              </Select>
            </FormControl>

            {newRoom.visibility === "passcode" && (
              <TextField
                label="パスコード"
                type="password"
                value={newRoom.passcode}
                onChange={(e) =>
                  setNewRoom({ ...newRoom, passcode: e.target.value })
                }
                fullWidth
              />
            )}

            <TextField
              label="定員"
              type="number"
              value={newRoom.capacity}
              onChange={(e) =>
                setNewRoom({
                  ...newRoom,
                  capacity: parseInt(e.target.value) || 5,
                })
              }
              inputProps={{ min: 1, max: 10 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleCreateRoom} variant="contained">
            作成
          </Button>
        </DialogActions>
      </Dialog>

      {/* パスコード入力ダイアログ */}
      <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)}>
        <DialogTitle>パスコードを入力</DialogTitle>
        <DialogContent>
          <TextField
            label="パスコード"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleJoinWithPasscode} variant="contained">
            参加
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
