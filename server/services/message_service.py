"""
メッセージ関連のデータストア操作（Redis）を提供するサービス層
"""

import os
import uuid
from datetime import datetime
from typing import List

import redis
from sqlalchemy.orm import Session

from ..database.models import Message, User

redis_client = redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True
)


def create_message(db: Session, room_id: str, user_id: str, content: str) -> Message:
    """
    新しいメッセージを作成
    """
    message_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()

    key = f"messages:{message_id}"
    # ユーザースナップショットを取得
    user = db.query(User).filter(User.id == user_id).first()
    user_name = user.name if user else ""
    user_picture = user.picture_url if user and user.picture_url else ""

    redis_client.hset(
        key,
        mapping={
            "id": message_id,
            "room_id": room_id,
            "user_id": user_id,
            "content": content,
            "created_at": created_at,
            # ユーザースナップショット
            "user_name": user_name,
            "user_picture": user_picture,
        },
    )
    redis_client.lpush(f"room:{room_id}:messages", message_id)

    return Message(
        id=message_id,
        room_id=room_id,
        user_id=user_id,
        content=content,
        created_at=created_at,
    )


def get_room_messages(
    db: Session, room_id: str, limit: int = 50, offset: int = 0
) -> List[Message]:
    """
    ルームのメッセージ一覧を取得（新しい順）
    """
    ids = redis_client.lrange(f"room:{room_id}:messages", offset, offset + limit - 1)
    messages: List[Message] = []
    for message_id_str in ids:
        data = redis_client.hgetall(f"messages:{message_id_str}")
        if not data:
            continue
        messages.append(
            Message(
                id=data.get("id", ""),
                room_id=data.get("room_id", room_id),
                user_id=data.get("user_id"),
                content=data.get("content", ""),
                created_at=data.get("created_at", datetime.now().isoformat()),
            )
        )
    return messages


def get_message_by_id(db: Session, message_id: str) -> Message | None:
    """
    メッセージIDでメッセージを取得
    """
    data = redis_client.hgetall(f"messages:{message_id}")
    if not data:
        return None
    return Message(
        id=data.get("id", message_id),
        room_id=data.get("room_id", ""),
        user_id=data.get("user_id"),
        content=data.get("content", ""),
        created_at=data.get("created_at", datetime.now().isoformat()),
    )


def delete_message(db: Session, message_id: str, user_id: str) -> bool:
    """
    メッセージを削除（送信者のみ可能）
    """
    data = redis_client.hgetall(f"messages:{message_id}")
    if not data:
        return False
    if data.get("user_id") != user_id:
        return False

    room_id = data.get("room_id", "")
    redis_client.lrem(f"room:{room_id}:messages", 1, message_id)
    redis_client.delete(f"messages:{message_id}")
    return True
