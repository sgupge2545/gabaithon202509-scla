import * as React from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { FcGoogle } from "react-icons/fc";
import ChatIcon from '@mui/icons-material/Chat';
import QuizIcon from '@mui/icons-material/Quiz';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

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
        variant="h2" 
        component="h1" 
        gutterBottom 
        sx={{ 
          fontWeight: 900,
          color: 'transparent',
          background: 'linear-gradient(135deg, #fff 0%, #e0e7ff 50%, #a5b4fc 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          mb: 6,
          textAlign: 'center',
          letterSpacing: '0.1em',
          position: 'relative',
          zIndex: 1,
        }}
      >
        NEXT GEN LOGIN
      </Typography>
      
      <Typography 
        variant="h6" 
        component="p" 
        sx={{ 
          color: 'rgba(255,255,255,0.8)',
          mb: 6,
          textAlign: 'center',
          fontWeight: 300,
          letterSpacing: '0.05em',
          position: 'relative',
          zIndex: 1,
        }}
      >
        次世代の認証システムへようこそ
      </Typography>

      {/* 装飾的なアイコン群 */}
      <Box
        sx={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          zIndex: 0,
          opacity: 0.6,
          animation: 'float 6s ease-in-out infinite',
        }}
      >
        <ChatIcon 
          sx={{ 
            fontSize: 48, 
            color: 'rgba(120, 119, 198, 0.8)',
            filter: 'drop-shadow(0 0 10px rgba(120, 119, 198, 0.5))'
          }} 
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          right: '15%',
          zIndex: 0,
          opacity: 0.7,
          animation: 'float 8s ease-in-out infinite reverse',
        }}
      >
        <QuizIcon 
          sx={{ 
            fontSize: 56, 
            color: 'rgba(255, 119, 198, 0.8)',
            filter: 'drop-shadow(0 0 12px rgba(255, 119, 198, 0.6))'
          }} 
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          bottom: '25%',
          left: '8%',
          zIndex: 0,
          opacity: 0.5,
          animation: 'float 7s ease-in-out infinite',
        }}
      >
        <AutoAwesomeIcon 
          sx={{ 
            fontSize: 40, 
            color: 'rgba(102, 126, 234, 0.8)',
            filter: 'drop-shadow(0 0 8px rgba(102, 126, 234, 0.5))'
          }} 
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          bottom: '20%',
          right: '12%',
          zIndex: 0,
          opacity: 0.6,
          animation: 'float 9s ease-in-out infinite reverse',
        }}
      >
        <ChatIcon 
          sx={{ 
            fontSize: 100, 
            color: 'rgba(166, 180, 252, 0.8)',
            filter: 'drop-shadow(0 0 10px rgba(166, 180, 252, 0.5))'
          }} 
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          padding: 8,
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
        <Typography 
          variant="h5" 
          component="h2" 
          gutterBottom 
          sx={{ 
            fontWeight: 700, 
            color: '#fff',
            mb: 4,
            letterSpacing: '0.05em'
          }}
        >
          ログイン
        </Typography>
        
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