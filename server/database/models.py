from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
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
    docs = relationship("Doc", back_populates="user")


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

    id = Column(String, primary_key=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    referenced_docs = Column(
        JSON, nullable=True
    )  # 参考資料の情報 [{"doc_id": "...", "filename": "..."}]
    created_at = Column(
        Text, nullable=False, default=lambda: datetime.now().isoformat()
    )

    # リレーション
    room = relationship("Room", back_populates="messages")
    user = relationship("User", back_populates="messages")

    # インデックス
    __table_args__ = (Index("idx_messages_room_time", "room_id", "created_at"),)


class Doc(Base):
    __tablename__ = "docs"

    id = Column(String, primary_key=True)
    uploaded_by = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    filename = Column(Text, nullable=False)
    mime_type = Column(String, nullable=False)  # 例: 'application/pdf'
    storage_uri = Column(Text, nullable=False)  # 実体の保存先（パス/URL）
    created_at = Column(
        Text, nullable=False, default=lambda: datetime.now().isoformat()
    )

    # リレーション
    user = relationship("User", back_populates="docs")
    chunks = relationship(
        "DocChunk", back_populates="doc", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_docs_uploader_time", "uploaded_by", "created_at"),)


class DocChunk(Base):
    __tablename__ = "doc_chunks"

    id = Column(String, primary_key=True)
    doc_id = Column(String, ForeignKey("docs.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)  # 0,1,2,...
    content = Column(Text, nullable=False)  # チャンク本文
    embedding = Column(
        LargeBinary, nullable=True
    )  # ベクトルは float32[] をBLOB化して保存
    created_at = Column(
        Text, nullable=False, default=lambda: datetime.now().isoformat()
    )

    # リレーション
    doc = relationship("Doc", back_populates="chunks")

    __table_args__ = (
        Index("idx_doc_chunks_doc", "doc_id"),
        Index("uq_doc_chunks_doc_idx", "doc_id", "chunk_index", unique=True),
    )
