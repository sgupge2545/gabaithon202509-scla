import logging
import os

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .database import Base, engine
from .routers import auth, game, messages, rooms

app = FastAPI(
    title="チャットアプリ API",
    description="リアルタイムチャットアプリケーションのAPI",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc",  # ReDoc
)

logging.basicConfig(level=logging.INFO)

# データベーステーブルを作成
Base.metadata.create_all(bind=engine)

# CORSミドルウェアを追加（開発用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # フロントエンドのオリジンを許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# セッションミドルウェアを追加
SECRET_KEY = os.getenv("SESSION_SECRET", "dev-secret-change-me")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, https_only=False)

# OAuthオブジェクトをアプリケーションに登録
app.state.oauth = auth.oauth

# APIルーターを作成
api_router = APIRouter()


# APIエンドポイントを定義
@api_router.get("/")
def read_root():
    return {"message": "Hello World"}


@api_router.get("/hello")
def read_hello():
    return {"message": "Hello from API!"}


@api_router.get("/openapi.json")
def get_openapi():
    """OpenAPI スキーマを取得"""
    return app.openapi()


# ルーターを登録（/apiプレフィックス付き）
app.include_router(api_router, prefix="/api", tags=["api"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(messages.router, prefix="/api/rooms", tags=["messages"])
app.include_router(game.router, prefix="/api/game", tags=["game"])

# Serve exported Next.js static files
app.mount("/", StaticFiles(directory="client/out", html=True), name="static")
