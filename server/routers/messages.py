"""
メッセージ関連のAPIエンドポイント
"""

import asyncio
import json
import logging
from typing import List

import redis
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db, room_service, user_service
from ..services.collection_manager import manager
from ..services.game_service import game_service
from ..services.message_service import (
    create_message,
    get_room_messages,
    redis_client,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# レスポンスモデル
class MessageResponse(BaseModel):
    id: str
    room_id: str
    user_id: str | None
    content: str
    created_at: str
    user: dict | None = None

    class Config:
        from_attributes = True


# リクエストモデル
class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


async def process_game_answer_async(
    game_id: str, user_id: str, content: str, user_name: str, message_id: str
):
    """ゲームの回答を非同期で処理"""
    try:
        # 新しいDBセッションを作成
        from ..database import get_db

        db_gen = get_db()
        db = next(db_gen)
        try:
            await game_service.submit_answer(
                db, game_id, user_id, content, user_name, message_id
            )
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to process async game answer: {e}")


def get_current_user(request: Request, db: Session) -> dict:
    """現在のユーザーを取得し、DB上の存在も保証する"""
    session_user = request.session.get("user")
    if not session_user:
        raise HTTPException(status_code=401, detail="認証が必要です")

    idp_id = session_user.get("idp_id")
    email = session_user.get("email")
    name = session_user.get("name")
    picture_url = session_user.get("picture_url")

    if not idp_id or not email or not name:
        raise HTTPException(status_code=401, detail="認証が必要です")

    db_user = user_service.create_or_update_user(
        db=db, idp_id=idp_id, email=email, name=name, picture_url=picture_url
    )

    request.session["user"] = {
        "id": db_user.id,
        "idp_id": db_user.idp_id,
        "email": db_user.email,
        "name": db_user.name,
        "picture_url": db_user.picture_url,
    }

    return request.session["user"]


@router.get("/{room_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """ルームのメッセージ一覧を取得"""
    current_user = get_current_user(request, db)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    try:
        messages = get_room_messages(db, room_id, limit, offset)
    except Exception as e:
        logger.exception("/rooms/{room_id}/messages 取得でエラーが発生しました")
        raise HTTPException(status_code=500, detail="メッセージ取得に失敗しました")

    result = []
    for message in messages:
        user_info = None
        try:
            data = redis_client.hgetall(f"messages:{message.id}")
            if data:
                name = data.get("user_name", "")
                picture = data.get("user_picture", "")
                if name or picture or message.user_id:
                    user_info = {
                        "id": message.user_id,
                        "name": name,
                        "picture": picture or None,
                    }
        except Exception:
            pass

        result.append(
            MessageResponse(
                id=message.id,
                room_id=message.room_id,
                user_id=message.user_id,
                content=message.content,
                created_at=message.created_at,
                user=user_info,
            )
        )

    return result


@router.websocket("/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket 接続: room_id ごとにクライアントを管理する"""
    try:
        # 接続をマネージャーに登録（accept()も含む）
        await manager.connect(room_id, websocket)
        logger.info(f"WebSocket connected for room {room_id}")

        while True:
            try:
                # クライアントからのメッセージを待機
                message = await websocket.receive_text()

                try:
                    # JSONメッセージの場合、ハートビートに対応
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        # ハートビートに応答
                        await websocket.send_text(json.dumps({"type": "pong"}))
                        continue
                except (json.JSONDecodeError, KeyError):
                    # JSON以外のメッセージは無視
                    pass

            except Exception as e:
                logger.error(
                    f"Error processing WebSocket message for room {room_id}: {e}"
                )
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error for room {room_id}: {e}")
    finally:
        # 接続をクリーンアップ
        try:
            await manager.disconnect(room_id, websocket)
        except Exception as e:
            logger.warning(f"Error during WebSocket cleanup for room {room_id}: {e}")


@router.post("/{room_id}/messages", response_model=MessageResponse)
async def send_message(
    room_id: str,
    message_data: SendMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """メッセージを送信"""
    current_user = get_current_user(request, db)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    # メッセージ作成（先に送信）
    try:
        message = create_message(
            db=db,
            room_id=room_id,
            user_id=current_user["id"],
            content=message_data.content,
        )
    except Exception as e:
        logger.exception("/rooms/{room_id}/messages 送信でエラーが発生しました")
        raise HTTPException(status_code=500, detail="メッセージ送信に失敗しました")

    # ユーザー情報（スナップショット）をRedisから取得
    user_info = None
    try:
        data = redis_client.hgetall(f"messages:{message.id}")
        if data:
            name = data.get("user_name", "")
            picture = data.get("user_picture", "")
            user_info = {
                "id": message.user_id,
                "name": name,
                "picture": picture or None,
            }
    except Exception:
        pass

    # ブロードキャスト
    payload = {
        "id": message.id,
        "room_id": message.room_id,
        "user_id": message.user_id,
        "content": message.content,
        "created_at": message.created_at,
        "user": user_info,
    }

    # 可能なら非同期で全クライアントに配信
    try:
        await manager.broadcast(room_id, payload)
    except Exception:
        # ブロードキャスト失敗は致命的ではない
        pass

    # ゲーム中の回答処理を非同期で実行（メッセージ送信後）
    try:
        # ルームで進行中のゲームがあるかチェック
        active_games = redis_client.keys("game:*")
        for game_key in active_games:
            try:
                game_data = redis_client.hgetall(game_key)
                if (
                    game_data.get("room_id") == room_id
                    and game_data.get("status") == "playing"
                ):
                    game_id = game_key.split(":")[-1]
                    # 回答処理を非同期で実行（メッセージIDを含める）
                    asyncio.create_task(
                        process_game_answer_async(
                            game_id,
                            current_user["id"],
                            message_data.content,
                            current_user.get("name", ""),
                            message.id,
                        )
                    )
                    break
            except redis.ResponseError as re:
                logger.warning(f"Redis type error for game {game_key}: {re}")
                continue
    except Exception as e:
        logger.warning(f"Failed to start async game answer processing: {e}")

    return MessageResponse(
        id=message.id,
        room_id=message.room_id,
        user_id=message.user_id,
        content=message.content,
        created_at=message.created_at,
        user=user_info,
    )
