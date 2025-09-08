"use client";

import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import Link from "next/link";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";

export default function Home() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
         'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%)',
        display: 'flex',
        flexDirection: 'culumn',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
           'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%)',
          pointerEvents: 'none',
        },
      }}
    >
      <AppBar
        sx={{
          p: { xs: 2.5, sm: 3 },
          px: { xs: 1, sm: 3},
          position: 'fixed',
          top: 0,
          left: 0,
          width: "100%",
          height: { xs: "80px", sm: "100px" },
          overflow: "hidden",
          background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.4)",
          zIndex: 10,
        }}
       >
        <Toolbar
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: { xs: "auto", sm: "auto" },
            pr: { xs: 0, sm: '16px' },
          }}
         >
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
            Ludus
          </Typography>
          <Stack direction="row" alignItems="center" spacing={{ xs: 0, sm: 2}}>
            {user?.picture && (
              <Image
                src={user.picture}
                alt="プロフィール画像"
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            {!isXs && (
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.9)'}}>
                {user?.name}
              </Typography>
            )}
            <Button
              onClick={logout}
              sx={{
                color: "rgba(255,255,255,0.7)",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
                borderRadius: "12px",
                },
              }}
            >
              ログアウト
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box
        sx={{
          maxWidth: "7xl",
          mx: "auto",
          px: { xs: 4, sm: 6, lg: 8 },
          py: 8,
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          color: "rgba(255,255,255,0.9)",
        }}
      >
        <Typography
          variant="h2"
          sx={{ fontWeight: "bold", mb: 4, fontSize: { xs: "1.2rem", sm: "1.5rem", md: "2rem" } }}
        >
          {isXs ? (
            <>
              ようこそ、
              <br />
              {user?.name}さん！
            </>
          ) : (
            <>ようこそ、{user?.name}さん！</>
          )}       
        </Typography>
        <Typography
          variant="h6"
          sx={{ color: "rgba(255,255,255,0.7)", mb: 8, fontSize: { xs: "0.9rem", sm: "1rem" } }}
        >
          {isXs ? (
            <>
              リアルタイムチャットアプリで
              <br />
              友達と楽しく会話しましょう
            </>
          ) : (
            'リアルタイムチャットアプリで友達と楽しく会話しましょう'
          )}     
        </Typography>
        <Button
          component={Link}
          href="/rooms"
          variant="contained"
          sx={{
            px: { xs: 5, sm: 8 },
            py: { xs: 1.5, sm: 2 },
            fontWeight: { xs: 500, sm: 700 },
            fontSize: { xs: "0.9rem", sm: "1rem" },
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
          {isXs ? (
            "チャットルームへ"
          ) : (
            "チャットルームを見る"
          )}
        </Button>
      </Box>
    </Box>
  );
}
