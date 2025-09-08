"use client";

import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import Link from "next/link";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";

export default function Header() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <AppBar
      sx={{
        p: { xs: 2.5, sm: 3 },
        px: { xs: 1, sm: 3 },
        position: "static",
        width: "100%",
        height: { xs: "80px", sm: "100px" },
        overflow: "hidden",
        background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
        boxShadow: "0 4px 10px rgba(0, 0, 0, 0.4)",
      }}
    >
      <Toolbar
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: { xs: "auto", sm: "auto" },
          pr: { xs: 0, sm: "16px" },
        }}
      >
        <Typography
          variant="h4"
          component={Link}
          href="/"
          sx={{
            fontWeight: { xs: 700, sm: 900 },
            fontSize: { xs: "24px", sm: "36px" },
            color: "transparent",
            background:
              "linear-gradient(135deg, #fff 0%, #e0e7ff 50%, #a5b4fc 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            letterSpacing: { xs: 0, sm: "0.1em" },
            textDecoration: "none",
            cursor: "pointer",
            "&:hover": {
              opacity: 0.8,
            },
          }}
        >
          Ludus
        </Typography>
        <Stack direction="row" alignItems="center" spacing={{ xs: 0, sm: 2 }}>
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
            <Typography sx={{ color: "rgba(255, 255, 255, 0.9)" }}>
              {user?.name}
            </Typography>
          )}
          <Button
            onClick={logout}
            sx={{
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: { xs: "12px", sm: "14px" },
              fontWeight: 600,
              px: { xs: 1, sm: 2 },
              py: { xs: 0.5, sm: 1 },
              borderRadius: "8px",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "rgba(255, 255, 255, 1)",
              },
            }}
          >
            ログアウト
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
