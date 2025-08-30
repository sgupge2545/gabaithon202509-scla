"""
メッセージ関連のAPIエンドポイント
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db, room_service
from ..database.message_service import create_message, get_room_messages
from ..database.models import User

router = APIRouter()


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


def get_current_user(request: Request) -> dict:
    """現在のユーザーを取得（セッションから）"""
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    return user


@router.get("/{room_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """ルームのメッセージ一覧を取得"""
    current_user = get_current_user(request)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    messages = get_room_messages(db, room_id, limit, offset)

    result = []
    for message in messages:
        user_info = None
        if message.user:
            user_info = {
                "id": message.user.id,
                "name": message.user.name,
                "picture": message.user.picture_url,
            }

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


@router.post("/{room_id}/messages", response_model=MessageResponse)
async def send_message(
    room_id: str,
    message_data: SendMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """メッセージを送信"""
    current_user = get_current_user(request)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    # メッセージ作成
    message = create_message(
        db=db,
        room_id=room_id,
        user_id=current_user["id"],
        content=message_data.content,
    )

    # ユーザー情報を取得
    user = db.query(User).filter(User.id == current_user["id"]).first()
    user_info = None
    if user:
        user_info = {
            "id": user.id,
            "name": user.name,
            "picture": user.picture_url,
        }

    return MessageResponse(
        id=message.id,
        room_id=message.room_id,
        user_id=message.user_id,
        content=message.content,
        created_at=message.created_at,
        user=user_info,
    )
