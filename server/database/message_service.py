"""
メッセージ関連のデータベース操作を提供するサービス層
"""

from typing import List

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from .models import Message, User


def create_message(
    db: Session,
    room_id: str,
    user_id: str,
    content: str,
) -> Message:
    """
    新しいメッセージを作成
    """
    db_message = Message(
        room_id=room_id,
        user_id=user_id,
        content=content,
    )

    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


def get_room_messages(
    db: Session,
    room_id: str,
    limit: int = 50,
    offset: int = 0,
) -> List[Message]:
    """
    ルームのメッセージ一覧を取得（新しい順）
    """
    return (
        db.query(Message)
        .options(joinedload(Message.user))
        .filter(Message.room_id == room_id)
        .order_by(desc(Message.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_message_by_id(db: Session, message_id: int) -> Message | None:
    """
    メッセージIDでメッセージを取得
    """
    return db.query(Message).filter(Message.id == message_id).first()


def delete_message(db: Session, message_id: int, user_id: str) -> bool:
    """
    メッセージを削除（送信者のみ可能）
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message or message.user_id != user_id:
        return False

    db.delete(message)
    db.commit()
    return True
