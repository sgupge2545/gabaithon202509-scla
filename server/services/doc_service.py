"""
ドキュメントとチャンクの管理サービス。

機能:
- ドキュメントの作成・保存
- チャンクの作成・保存
- embeddingベクトルのシリアライゼーション
"""

from __future__ import annotations

import pickle
import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from ..database.models import Doc, DocChunk


def serialize_vector(vector: List[float]) -> bytes:
    """embeddingベクトルをバイナリ形式にシリアライズ。

    Args:
        vector: embeddingベクトル

    Returns:
        シリアライズされたバイナリデータ
    """
    return pickle.dumps(vector)


def deserialize_vector(binary_data: bytes) -> List[float]:
    """バイナリデータからembeddingベクトルをデシリアライズ。

    Args:
        binary_data: シリアライズされたバイナリデータ

    Returns:
        embeddingベクトル
    """
    return pickle.loads(binary_data)


def create_doc_with_chunks(
    db: Session,
    filename: str,
    mime_type: str,
    uploader_id: str,
    chunks_data: List[tuple[str, List[float]]],  # (content, embedding)
) -> Doc:
    """ドキュメントとそのチャンクを一括作成・保存。

    Args:
        db: データベースセッション
        filename: ファイル名
        mime_type: MIMEタイプ
        uploader_id: アップロード者ID
        chunks_data: (チャンク内容, embeddingベクトル) のタプルのリスト

    Returns:
        作成されたDocオブジェクト
    """
    # ドキュメントを作成
    doc = Doc(
        id=str(uuid.uuid4()),
        filename=filename,
        mime_type=mime_type,
        uploaded_by=uploader_id,
        storage_uri="",
    )

    db.add(doc)
    db.flush()

    # チャンクを作成
    for chunk_index, (content, embedding) in enumerate(chunks_data):
        chunk = DocChunk(
            id=str(uuid.uuid4()),
            doc_id=doc.id,
            chunk_index=chunk_index,
            content=content,
            embedding=serialize_vector(embedding) if embedding else None,
        )
        db.add(chunk)

    db.commit()
    return doc


def get_doc_by_id(db: Session, doc_id: str) -> Optional[Doc]:
    """IDでドキュメントを取得。

    Args:
        db: データベースセッション
        doc_id: ドキュメントID

    Returns:
        Docオブジェクト（存在しない場合はNone）
    """
    return db.query(Doc).filter(Doc.id == doc_id).first()


def get_doc_chunks(db: Session, doc_id: str) -> List[DocChunk]:
    """ドキュメントのチャンクを取得。

    Args:
        db: データベースセッション
        doc_id: ドキュメントID

    Returns:
        DocChunkオブジェクトのリスト
    """
    return (
        db.query(DocChunk)
        .filter(DocChunk.doc_id == doc_id)
        .order_by(DocChunk.chunk_index)
        .all()
    )


def get_all_chunks_with_embeddings(db: Session) -> List[tuple[DocChunk, List[float]]]:
    """embeddingを持つ全チャンクを取得。

    Args:
        db: データベースセッション

    Returns:
        (DocChunk, embeddingベクトル) のタプルのリスト
    """
    chunks = db.query(DocChunk).filter(DocChunk.embedding.isnot(None)).all()

    result = []
    for chunk in chunks:
        if chunk.embedding:
            embedding = deserialize_vector(chunk.embedding)
            result.append((chunk, embedding))

    return result


def get_user_documents(
    db: Session, user_id: str, limit: int = 50, offset: int = 0
) -> List[dict]:
    """ユーザーがアップロードしたドキュメント一覧を取得。

    Args:
        db: データベースセッション
        user_id: ユーザーID
        limit: 取得件数の上限
        offset: オフセット

    Returns:
        ドキュメント情報の辞書のリスト
    """
    docs = (
        db.query(Doc)
        .filter(Doc.uploaded_by == user_id)
        .order_by(Doc.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for doc in docs:
        # チャンク数を取得
        chunk_count = db.query(DocChunk).filter(DocChunk.doc_id == doc.id).count()

        # プレビューテキストを取得（最初のチャンク）
        first_chunk = (
            db.query(DocChunk)
            .filter(DocChunk.doc_id == doc.id)
            .order_by(DocChunk.chunk_index)
            .first()
        )

        result.append(
            {
                "id": doc.id,
                "filename": doc.filename,
                "mime_type": doc.mime_type,
                "created_at": doc.created_at,
                "chunk_count": chunk_count,
                "preview": first_chunk.content[:100] + "..."
                if first_chunk and first_chunk.content
                else "",
            }
        )

    return result


def get_chunks_from_selected_docs(db: Session, doc_ids: List[str]) -> List[DocChunk]:
    """選択されたドキュメントからすべてのチャンクを取得。

    Args:
        db: データベースセッション
        doc_ids: ドキュメントIDのリスト

    Returns:
        DocChunkオブジェクトのリスト
    """
    return (
        db.query(DocChunk)
        .filter(DocChunk.doc_id.in_(doc_ids))
        .filter(DocChunk.embedding.is_not(None))  # embeddingがあるもののみ
        .order_by(DocChunk.doc_id, DocChunk.chunk_index)
        .all()
    )


__all__ = [
    "serialize_vector",
    "deserialize_vector",
    "create_doc_with_chunks",
    "get_doc_by_id",
    "get_doc_chunks",
    "get_all_chunks_with_embeddings",
    "get_user_documents",
    "get_chunks_from_selected_docs",
]
