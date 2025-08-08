import os

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from .routers import auth

app = FastAPI()

# セッションミドルウェアを追加
SECRET_KEY = os.getenv("SESSION_SECRET", "dev-secret-change-me")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, https_only=False)

# OAuthオブジェクトをアプリケーションに登録
app.state.oauth = auth.oauth

# ルーターを登録
app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/")
def read_root():
    return {"message": "Hello World"}
