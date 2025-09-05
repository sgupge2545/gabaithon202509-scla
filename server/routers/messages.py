"""
メッセージ関連のAPIエンドポイント
"""

import logging
from typing import List

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
from ..services.message_service import (
    create_message,
    get_room_messages,
    redis_client,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# レスポンスモデル
class MessageResponse(BaseModel):
    id: int
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
    await manager.connect(room_id, websocket)
    try:
        while True:
            # クライアントからのメッセージを待機して接続を維持する（処理は不要）
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(room_id, websocket)


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

    # メッセージ作成
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

    return MessageResponse(
        id=message.id,
        room_id=message.room_id,
        user_id=message.user_id,
        content=message.content,
        created_at=message.created_at,
        user=user_info,
    )
