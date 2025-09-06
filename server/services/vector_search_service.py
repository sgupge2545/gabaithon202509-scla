"""
ベクトル検索サービス - embeddingを使った類似チャンク検索
"""

import logging
from typing import List, Tuple

import numpy as np
from sqlalchemy.orm import Session

from ..database.models import DocChunk
from ..services.doc_service import deserialize_vector
from ..services.embedding import create_embeddings


class VectorSearchService:
    """ベクトル検索サービス"""

    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """コサイン類似度を計算"""
        try:
            # numpy配列に変換
            a = np.array(vec1)
            b = np.array(vec2)

            # コサイン類似度を計算
            dot_product = np.dot(a, b)
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)

            if norm_a == 0 or norm_b == 0:
                return 0.0

            return dot_product / (norm_a * norm_b)
        except Exception as e:
            logging.error(f"Cosine similarity calculation failed: {e}")
            return 0.0

    @staticmethod
    async def search_similar_chunks(
        db: Session,
        query_text: str,
        doc_ids: List[str],
        limit: int = 20,
        min_similarity: float = 0.1,
    ) -> List[Tuple[DocChunk, float]]:
        """
        クエリテキストに類似するチャンクを検索

        Args:
            db: データベースセッション
            query_text: 検索クエリ
            doc_ids: 検索対象のドキュメントIDリスト
            limit: 取得する最大件数
            min_similarity: 最小類似度閾値

        Returns:
            (DocChunk, 類似度) のタプルのリスト
        """
        try:
            # クエリテキストをembedding化
            query_embeddings = create_embeddings([query_text])
            if not query_embeddings:
                logging.error("Failed to create embedding for query")
                return []

            query_vector = query_embeddings[0]

            # 指定されたドキュメントからチャンクを取得
            chunks = (
                db.query(DocChunk)
                .filter(DocChunk.doc_id.in_(doc_ids))
                .filter(DocChunk.embedding.is_not(None))
                .all()
            )

            if not chunks:
                logging.warning(f"No chunks found for documents: {doc_ids}")
                return []

            # 各チャンクとの類似度を計算
            similarities = []
            for chunk in chunks:
                try:
                    chunk_vector = deserialize_vector(chunk.embedding)
                    similarity = VectorSearchService.cosine_similarity(
                        query_vector, chunk_vector
                    )

                    if similarity >= min_similarity:
                        similarities.append((chunk, similarity))

                except Exception as e:
                    logging.warning(f"Failed to process chunk {chunk.id}: {e}")
                    continue

            # 類似度でソートして上位を返す
            similarities.sort(key=lambda x: x[1], reverse=True)
            result = similarities[:limit]

            logging.info(
                f"Vector search: query='{query_text[:50]}...', found {len(result)} similar chunks"
            )

            return result

        except Exception as e:
            logging.error(f"Vector search failed: {e}")
            return []

    @staticmethod
    def get_chunks_from_selected_docs(
        db: Session, doc_ids: List[str], limit: int = 50
    ) -> List[DocChunk]:
        """
        選択されたドキュメントからランダムにチャンクを取得

        Args:
            db: データベースセッション
            doc_ids: ドキュメントIDのリスト
            limit: 取得する最大件数

        Returns:
            DocChunkのリスト
        """
        try:
            chunks = (
                db.query(DocChunk)
                .filter(DocChunk.doc_id.in_(doc_ids))
                .filter(DocChunk.embedding.is_not(None))
                .order_by(DocChunk.doc_id, DocChunk.chunk_index)
                .limit(limit)
                .all()
            )

            logging.info(
                f"Retrieved {len(chunks)} chunks from {len(doc_ids)} documents"
            )
            return chunks

        except Exception as e:
            logging.error(f"Failed to get chunks from documents: {e}")
            return []


# グローバルインスタンス
vector_search_service = VectorSearchService()
