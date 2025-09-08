"use client";

import React, { useState } from "react";
import ChatIcon from "@mui/icons-material/Chat";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FaPlus, FaUsers, FaLock } from "react-icons/fa";
import { useRoom } from "@/contexts/RoomContext";
import { Room, CreateRoomData } from "@/types/room";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

export default function RoomsPage() {
  const { publicRooms, createRoom, joinRoom, setCurrentRoom } = useRoom();
  const router = useRouter();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [passcode, setPasscode] = useState("");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [newRoom, setNewRoom] = useState<CreateRoomData>({
    title: "",
    visibility: "public",
    passcode: "",
    capacity: 5,
  });

  const handleCreateRoom = async () => {
    if (!newRoom.title.trim()) return;

    // パスコード付きルームの場合、パスコードが入力されているかチェック
    if (newRoom.visibility === "passcode" && !newRoom.passcode?.trim()) {
      alert("パスコードを入力してください");
      return;
    }

    const room = await createRoom(newRoom);
    if (room) {
      await setCurrentRoom(room.id);
      setCreateDialogOpen(false);
      setNewRoom({
        title: "",
        visibility: "public",
        passcode: "",
        capacity: 5,
      });
      router.push(`/chat`);
    }
  };

  const handleJoinRoom = async (room: Room, needsPasscode: boolean = false) => {
    if (needsPasscode) {
      setSelectedRoomId(room.id);
      setJoinDialogOpen(true);
    } else {
      const success = await joinRoom(room.id);
      if (success) {
        router.push(`/chat`);
      }
    }
  };

  const handleJoinWithPasscode = async () => {
    const success = await joinRoom(selectedRoomId, { passcode });
    if (success) {
      router.push(`/chat`);
      setJoinDialogOpen(false);
      setPasscode("");
      setSelectedRoomId("");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%)",
          pointerEvents: "none",
        },
      }}
    >
      <Header />
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          mb: 3,
          px: { xs: 2, sm: 4 },
          pt: { xs: 2, sm: 3 },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <ChatIcon
            sx={{
              fontSize: { xs: 30, sm: 48, md: 56 },
              color: "rgba(120, 119, 198, 0.8)",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
              transition: "all 0.3s ease",
              animation: "float 3s ease-in-out infinite",
              "@keyframes float": {
                "0%, 100%": {
                  transform: "translateY(0px) rotate(0deg)",
                },
                "50%": {
                  transform: "translateY(-8px) rotate(5deg)",
                },
              },
              "&:hover": {
                color: "rgba(120, 119, 198, 1)",
                transform: "scale(1.1) rotate(10deg)",
                filter: "drop-shadow(0 6px 12px rgba(120, 119, 198, 0.4))",
              },
            }}
          />
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: { xs: 700, sm: 900 },
              fontSize: { xs: "24px", sm: "36px" },
              color: "transparent",
              background:
                "linear-gradient(135deg, #fff 0%, #e0e7ff 50%, #a5b4fc 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              letterSpacing: { xs: 0, sm: "0.1em" },
            }}
          >
            チャットルーム
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<FaPlus />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{
            pl: { xs: 1.5, sm: 4 },
            py: { xs: 1, sm: 1.5 },
            pr: { xs: 0, sm: 4 },
            fontWeight: 700,
            fontSize: { xs: "0.8rem", sm: "1rem" },
            textTransform: "none",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(102, 126, 234, 0.4)",
            transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            position: "relative",
            overflow: "hidden",
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: "-100%",
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
              transition: "left 0.5s",
            },
            "&:hover": {
              background: "linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)",
              boxShadow: "0 20px 40px rgba(102, 126, 234, 0.6)",
              transform: "translateY(-4px) scale(1.02)",
              "&::before": {
                left: "100%",
              },
            },
            "&:active": {
              transform: "translateY(-2px) scale(1.01)",
            },
          }}
        >
          {!isMobile && "ルーム作成"}
        </Button>
      </Stack>

      {/* メインコンテンツ */}
      <Box
        sx={{
          flex: 1,
          px: { xs: 2, sm: 4 },
          py: 4,
          pt: { xs: 5, sm: 6 }, // ヘッダーとの間隔
        }}
      >
        <Stack spacing={2} alignItems="center">
          {publicRooms.map((room: Room) => (
            <Card
              key={room.id}
              elevation={0}
              sx={{
                width: { xs: "85%", sm: "70%", md: "50%" },
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "20px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                "&:hover": {
                  transform: "translateY(-8px) scale(1.02)",
                  boxShadow: "0 35px 60px -12px rgba(0, 0, 0, 0.6)",
                  background: "rgba(255,255,255,0.12)",
                },
              }}
            >
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography
                      variant="h6"
                      component="h2"
                      sx={{
                        color: "rgba(255,255,255,0.9)",
                        fontWeight: 500,
                        fontSize: { xs: "16px", sm: "24px" },
                        mb: 1,
                        ml: 1,
                      }}
                    >
                      {room.title}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip
                        icon={<FaUsers />}
                        label={`${room.members?.length || 0}/${room.capacity}`}
                        size="medium"
                        sx={{
                          background: "rgba(120, 119, 198, 0.2)",
                          color: "rgba(255,255,255,0.9)",
                          border: "1px solid rgba(120, 119, 198, 0.3)",
                        }}
                      />
                      {room.visibility === "passcode" && (
                        <Chip
                          icon={<FaLock />}
                          label="パスコード"
                          size="small"
                          sx={{
                            background: "rgba(255, 119, 198, 0.2)",
                            color: "rgba(255,255,255,0.9)",
                            border: "1px solid rgba(255, 119, 198, 0.3)",
                          }}
                        />
                      )}
                    </Stack>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      handleJoinRoom(room, room.visibility === "passcode")
                    }
                    disabled={(room.members?.length || 0) >= room.capacity}
                    sx={{
                      px: 3,
                      py: 1,
                      fontWeight: 600,
                      textTransform: "none",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.3)",
                      color: "rgba(255,255,255,0.9)",
                      background: "rgba(255,255,255,0.05)",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        background: "rgba(255,255,255,0.2)",
                        border: "1.3px solid rgba(255,255,255,0.5)",
                        transform: "translateY(-2px)",
                      },
                      "&:disabled": {
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      },
                    }}
                  >
                    {(room.members?.length || 0) >= room.capacity
                      ? "満室"
                      : "参加"}
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
          PaperProps={{
            sx: {
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            },
          }}
        >
          <DialogTitle
            sx={{
              color: "rgba(255,255,255,0.9)",
              fontWeight: 700,
              fontSize: { xs: "1rem", sm: "1.5rem" },
            }}
          >
            新しいルームを作成
          </DialogTitle>
          <DialogContent>
            <Stack spacing={3} sx={{ mt: 1 }}>
              <TextField
                label="ルーム名"
                value={newRoom.title}
                onChange={(e) =>
                  setNewRoom({ ...newRoom, title: e.target.value })
                }
                fullWidth
                sx={{
                  "& .MuiOutlinedInput-root": {
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "12px",
                    "& fieldset": {
                      borderColor: "rgba(255,255,255,0.2)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(255,255,255,0.3)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "rgba(120, 119, 198, 0.5)",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputLabel-root.MuiFormLabel-filled": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputBase-input": {
                    color: "rgba(255,255,255,0.9)",
                  },
                }}
              />

              <FormControl fullWidth>
                <InputLabel
                  sx={{
                    color: "rgba(255,255,255,0.9)",
                    "&.Mui-focused": {
                      color: "rgba(255,255,255,0.9)",
                    },
                    "&.MuiFormLabel-filled": {
                      color: "rgba(255,255,255,0.9)",
                    },
                  }}
                >
                  公開設定
                </InputLabel>
                <Select
                  value={newRoom.visibility}
                  label="公開設定"
                  onChange={(e) => {
                    const visibility = e.target.value as "public" | "passcode";
                    setNewRoom({
                      ...newRoom,
                      visibility,
                      // 公開に変更した場合はパスコードをクリア
                      passcode: visibility === "public" ? "" : newRoom.passcode,
                    });
                  }}
                  sx={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "12px",
                    color: "rgba(255,255,255,0.9)",
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,0.2)",
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,0.3)",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(120, 119, 198, 0.5)",
                    },
                    "& .MuiSelect-icon": {
                      color: "rgba(255,255,255,0.9)",
                    },
                  }}
                >
                  <MenuItem value="public">公開</MenuItem>
                  <MenuItem value="passcode">パスコード</MenuItem>
                </Select>
              </FormControl>

              {newRoom.visibility === "passcode" && (
                <TextField
                  label="パスコード"
                  type="text"
                  value={newRoom.passcode}
                  onChange={(e) =>
                    setNewRoom({ ...newRoom, passcode: e.target.value })
                  }
                  required
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: "12px",
                      "& fieldset": {
                        borderColor: "rgba(255,255,255,0.2)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255,255,255,0.3)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "rgba(120, 119, 198, 0.5)",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255,255,255,0.9)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "rgba(255,255,255,0.9)",
                    },
                    "& .MuiInputLabel-root.MuiFormLabel-filled": {
                      color: "rgba(255,255,255,0.9)",
                    },
                    "& .MuiInputBase-input": {
                      color: "rgba(255,255,255,0.9)",
                    },
                  }}
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
                sx={{
                  "& .MuiOutlinedInput-root": {
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "12px",
                    "& fieldset": {
                      borderColor: "rgba(255,255,255,0.2)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(255,255,255,0.3)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "rgba(120, 119, 198, 0.5)",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputLabel-root.MuiFormLabel-filled": {
                    color: "rgba(255,255,255,0.9)",
                  },
                  "& .MuiInputBase-input": {
                    color: "rgba(255,255,255,0.9)",
                  },
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setCreateDialogOpen(false)}
              sx={{
                color: "rgba(255,255,255,0.7)",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.9)",
                  borderRadius: "12px",
                  p: "8px",
                },
              }}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleCreateRoom}
              variant="contained"
              sx={{
                px: 4,
                py: 1,
                fontWeight: 700,
                textTransform: "none",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(102, 126, 234, 0.4)",
                transition: "all 0.3s ease",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)",
                  boxShadow: "0 15px 35px rgba(102, 126, 234, 0.6)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              作成
            </Button>
          </DialogActions>
        </Dialog>

        {/* パスコード入力ダイアログ */}
        <Dialog
          open={joinDialogOpen}
          onClose={() => setJoinDialogOpen(false)}
          PaperProps={{
            sx: {
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            },
          }}
        >
          <DialogTitle
            sx={{
              color: "rgba(255,255,255,0.9)",
              fontWeight: 700,
              fontSize: "1.5rem",
            }}
          >
            パスコードを入力
          </DialogTitle>
          <DialogContent>
            <TextField
              label="パスコード"
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              fullWidth
              sx={{
                mt: 1,
                "& .MuiOutlinedInput-root": {
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  "& fieldset": {
                    borderColor: "rgba(255,255,255,0.2)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(255,255,255,0.3)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "rgba(120, 119, 198, 0.5)",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "rgba(255,255,255,0.7)",
                },
                "& .MuiInputBase-input": {
                  color: "rgba(255,255,255,0.9)",
                },
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setJoinDialogOpen(false)}
              sx={{
                color: "rgba(255,255,255,0.7)",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.9)",
                },
              }}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleJoinWithPasscode}
              variant="contained"
              sx={{
                px: 4,
                py: 1,
                fontWeight: 700,
                textTransform: "none",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(102, 126, 234, 0.4)",
                transition: "all 0.3s ease",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)",
                  boxShadow: "0 15px 35px rgba(102, 126, 234, 0.6)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              参加
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
