from datetime import datetime

from sqlalchemy import CheckConstraint, Column, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    idp_id = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    picture_url = Column(String, nullable=True)

    # リレーション
    room_memberships = relationship("RoomMember", back_populates="user")
    messages = relationship("Message", back_populates="user")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True)
    title = Column(Text, nullable=False)
    visibility = Column(String, nullable=False, default="public")
    passcode_hash = Column(Text, nullable=True)
    capacity = Column(Integer, nullable=False, default=5)
    created_at = Column(
        Text, nullable=False, default=lambda: datetime.now().isoformat()
    )

    # 制約
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('public', 'passcode')", name="check_visibility"
        ),
        CheckConstraint("capacity > 0 AND capacity <= 10", name="check_capacity"),
    )

    # リレーション
    members = relationship("RoomMember", back_populates="room")
    messages = relationship("Message", back_populates="room")


class RoomMember(Base):
    __tablename__ = "room_members"

    room_id = Column(
        String, ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True
    )
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at = Column(Text, nullable=False, default=lambda: datetime.now().isoformat())

    # リレーション
    room = relationship("Room", back_populates="members")
    user = relationship("User", back_populates="room_memberships")

    # インデックス
    __table_args__ = (
        Index("idx_room_members_room", "room_id"),
        Index("idx_room_members_user", "user_id"),
        Index("idx_room_members_joined", "room_id", "joined_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(
        Text, nullable=False, default=lambda: datetime.now().isoformat()
    )

    # リレーション
    room = relationship("Room", back_populates="messages")
    user = relationship("User", back_populates="messages")

    # インデックス
    __table_args__ = (Index("idx_messages_room_time", "room_id", "created_at"),)
