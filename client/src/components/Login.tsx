import * as React from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { FcGoogle } from "react-icons/fc";
import ChatIcon from '@mui/icons-material/Chat';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AddIcon from '@mui/icons-material/Add';
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 768,
      md: 1024,
      lg: 1280,
      xl: 1920,
    },
  },
});

export default function Login() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%)',
          pointerEvents: 'none',
        },
        '@keyframes float': {
          '0%, 100%': {
            transform: 'translateY(0px) rotate(0deg)',
          },
          '50%': {
            transform: 'translateY(-20px) rotate(5deg)',
          },
        },
      }}
    >
      <Typography 
        variant="h3" 
        component="h1" 
        gutterBottom 
        sx={{ 
          fontWeight: 900,
          color: 'transparent',
          background: 'linear-gradient(135deg, #fff 0%, #e0e7ff 50%, #a5b4fc 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          textAlign: 'center',
          mb: 22,
          letterSpacing: '0.1em',
          position: 'relative',
          zIndex: 1,
        }}
      >
        アプリ名
      </Typography>

      {/* 装飾的なアイコン群 */}
      <Box
        sx={{
          position: 'absolute',
          top: { xs: '32%', sm: '28%', md: '28%' },
          left: '50%',
          zIndex: 0,
          opacity: 0.5,
          transform: 'translateX(-50%)',
        }}
      >
        <ChatIcon 
          sx={{ 
            fontSize: { xs: 60, sm: 80, md: 90 },
            color: 'rgba(120, 119, 198, 0.8)',  
          }} 
        />
        <AddIcon 
          sx={{ 
            fontSize: { xs: 50, sm: 70, md: 80 }, 
            color: 'white',
            transform: 'rotate(45deg)'
          }} 
        />
        <PsychologyIcon 
          sx={{ 
            fontSize: { xs: 60, sm: 80, md: 90 }, 
            color: 'rgba(255, 119, 198, 0.8)',
          }} 
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          padding: 7,
          borderRadius: '24px',
          minWidth: 400,
          textAlign: 'center',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <AccountCircleIcon 
          sx={{
            fontSize: 140,
            color: 'rgba(255,255,255,0.9)',
            mb: 3,
            position: 'absolute',
            top: '-40%',
            left: '130px',
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
            transition: 'all 0.3s ease',
            '&:hover': {
              color: 'rgba(255,255,255,1)',
              transform: 'scale(1.05)',
              filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.4))',
            }
          }}
        />
        
        <Button
          variant="contained"
          size="large"
          startIcon={<FcGoogle />}
          sx={{
            mt: 2,
            px: 6,
            py: 2,
            fontWeight: 700,
            fontSize: '1.1rem',
            textTransform: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(102, 126, 234, 0.4)',
            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
              transition: 'left 0.5s',
            },
            '&:hover': {
              background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
              boxShadow: '0 20px 40px rgba(102, 126, 234, 0.6)',
              transform: 'translateY(-4px) scale(1.02)',
              '&::before': {
                left: '100%',
              },
            },
            '&:active': {
              transform: 'translateY(-2px) scale(1.01)',
            }
          }}
        >
          Googleでログイン
        </Button>
      </Paper>
    </Box>
  );
}