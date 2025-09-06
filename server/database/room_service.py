"""
ルーム関連のデータベース操作を提供するサービス層
"""

import hashlib
import logging
import uuid
from typing import List, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from .models import Room, RoomMember, User

logger = logging.getLogger(__name__)


def create_room(
    db: Session,
    title: str,
    creator_user_id: str,
    visibility: str = "public",
    passcode: Optional[str] = None,
    capacity: int = 5,
) -> Room:
    """
    新しいルームを作成し、作成者を自動参加させる
    """
    # ルームIDを生成
    room_id = str(uuid.uuid4())

    # パスコードのハッシュ化
    passcode_hash = None
    if visibility == "passcode" and passcode:
        passcode_hash = hashlib.sha256(passcode.encode()).hexdigest()

    # ルーム作成
    db_room = Room(
        id=room_id,
        title=title,
        visibility=visibility,
        passcode_hash=passcode_hash,
        capacity=capacity,
    )

    db.add(db_room)
    db.flush()  # IDを取得するため

    # 作成者を自動参加
    db_member = RoomMember(
        room_id=room_id,
        user_id=creator_user_id,
    )
    db.add(db_member)

    db.commit()
    db.refresh(db_room)
    return db_room


def get_room_by_id(db: Session, room_id: str) -> Optional[Room]:
    """
    ルームIDでルームを取得
    """
    return db.query(Room).filter(Room.id == room_id).first()


def delete_room(db: Session, room_id: str, user_id: str) -> bool:
    """
    ルームを削除（作成者のみ可能）
    カスケードでroom_membersとmessagesも自動削除される
    """
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return False

    # 作成者チェック（最初に参加したユーザーを作成者とみなす）
    first_member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id)
        .order_by(RoomMember.joined_at)
        .first()
    )
    if not first_member or first_member.user_id != user_id:
        return False

    # 生のSQLでCASCADE削除を実行
    db.execute(text("DELETE FROM rooms WHERE id = :room_id"), {"room_id": room_id})
    db.commit()

    # Redisのゲーム情報もクリーンアップ
    try:
        from ..services.game_service import game_service

        game_service.cleanup_room_games(room_id)
    except Exception as e:
        # ゲームクリーンアップに失敗してもルーム削除は成功とする
        logging.warning(f"Failed to cleanup games for room {room_id}: {e}")

    return True


def get_public_rooms(db: Session, limit: int = 20) -> List[Room]:
    """
    公開ルーム一覧を取得（参加者数付き）
    """
    # 公開とパスコード付きのルームを一覧に含める
    return (
        db.query(Room)
        .filter(Room.visibility.in_(["public", "passcode"]))
        .order_by(Room.created_at.desc())
        .limit(limit)
        .all()
    )


def join_room(
    db: Session, room_id: str, user_id: str, passcode: Optional[str] = None
) -> bool:
    """
    ルームに参加する
    Returns: 成功時True、失敗時False
    """
    # ルーム取得
    room = get_room_by_id(db, room_id)
    if not room:
        logger.warning(
            "join_room 失敗: ルームが存在しません room_id=%s user_id=%s",
            room_id,
            user_id,
        )
        return False

    # パスコード確認
    if room.visibility == "passcode":
        if not passcode:
            logger.warning(
                "join_room 失敗: パスコード未入力 room_id=%s user_id=%s",
                room_id,
                user_id,
            )
            return False
        passcode_hash = hashlib.sha256(passcode.encode()).hexdigest()
        if passcode_hash != room.passcode_hash:
            logger.warning(
                "join_room 失敗: パスコード不一致 room_id=%s user_id=%s",
                room_id,
                user_id,
            )
            return False

    # 既に参加済みかチェック
    existing_member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        .first()
    )
    if existing_member:
        return True

    # 定員チェック
    current_members = (
        db.query(func.count(RoomMember.user_id))
        .filter(RoomMember.room_id == room_id)
        .scalar()
    )
    if current_members >= room.capacity:
        logger.warning(
            "join_room 失敗: 満室 room_id=%s user_id=%s capacity=%s current=%s",
            room_id,
            user_id,
            room.capacity,
            current_members,
        )
        return False

    # 参加処理
    try:
        db_member = RoomMember(room_id=room_id, user_id=user_id)
        db.add(db_member)
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.exception(
            "join_room 失敗: DBエラー room_id=%s user_id=%s", room_id, user_id
        )
        return False


def leave_room(db: Session, room_id: str, user_id: str) -> bool:
    """
    ルームから退出する
    """
    member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        .first()
    )

    if not member:
        return True  # 既に退出済みなら成功扱い

    try:
        db.delete(member)
        db.commit()
        # 退出後、メンバーがいなければルームを削除
        remaining = (
            db.query(func.count(RoomMember.user_id))
            .filter(RoomMember.room_id == room_id)
            .scalar()
        )
        if remaining == 0:
            # CASCADE削除
            db.execute(
                text("DELETE FROM rooms WHERE id = :room_id"), {"room_id": room_id}
            )
            db.commit()

            # Redisのゲーム情報もクリーンアップ
            try:
                from ..services.game_service import game_service

                game_service.cleanup_room_games(room_id)
            except Exception as e:
                # ゲームクリーンアップに失敗してもルーム削除は成功とする
                logging.warning(f"Failed to cleanup games for room {room_id}: {e}")
        return True
    except Exception:
        db.rollback()
        return False


def get_room_members(db: Session, room_id: str) -> List[User]:
    """
    ルームの参加者一覧を取得（参加順）
    """
    return (
        db.query(User)
        .join(RoomMember)
        .filter(RoomMember.room_id == room_id)
        .order_by(RoomMember.joined_at.desc())
        .all()
    )


def is_user_in_room(db: Session, room_id: str, user_id: str) -> bool:
    """
    ユーザーがルームに参加しているかチェック
    """
    member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        .first()
    )
    return member is not None
