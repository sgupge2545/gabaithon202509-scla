"""
AI チャットサービス
@ludus メンションに対してAIが返信する機能
"""

import logging
import re
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from ..database.models import DocChunk, User
from ..services.doc_service import deserialize_vector
from ..services.embedding import create_single_embedding
from ..services.llm_service import llm

logger = logging.getLogger(__name__)


class AIChatService:
    """AI チャットサービス"""

    @staticmethod
    def ensure_system_user(db: Session) -> None:
        """システムユーザー（Ludus）が存在することを確認"""
        try:
            system_user = db.query(User).filter(User.id == "system").first()
            if not system_user:
                system_user = User(
                    id="system",
                    idp_id="system",
                    email="ludus@system.local",
                    name="Ludus",
                    picture_url=None,
                )
                db.add(system_user)
                db.commit()
                logger.info("Created system user (Ludus)")
        except Exception as e:
            logger.error(f"Failed to ensure system user: {e}")

    @staticmethod
    def should_respond_to_message(content: str) -> bool:
        """メッセージに@ludusメンションが含まれているかチェック"""
        # @ludus または @Ludus または @LUDUS にマッチ
        pattern = r"@ludus\b"
        return bool(re.search(pattern, content, re.IGNORECASE))

    @staticmethod
    def extract_user_message(content: str) -> str:
        """@ludusメンションを除いた実際のメッセージ内容を抽出"""
        # @ludus を削除してクリーンアップ
        pattern = r"@ludus\s*"
        cleaned = re.sub(pattern, "", content, flags=re.IGNORECASE).strip()
        return cleaned

    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """コサイン類似度を計算"""
        try:
            import math

            dot_product = sum(a * b for a, b in zip(vec1, vec2))
            magnitude1 = math.sqrt(sum(a * a for a in vec1))
            magnitude2 = math.sqrt(sum(a * a for a in vec2))

            if magnitude1 == 0 or magnitude2 == 0:
                return 0.0

            return dot_product / (magnitude1 * magnitude2)
        except Exception:
            return 0.0

    @staticmethod
    async def search_relevant_chunks(
        db: Session, query_text: str, top_k: int = 5
    ) -> List[Tuple[DocChunk, float]]:
        """ユーザーの質問に関連するチャンクをベクトル検索で取得"""
        try:
            # クエリをembedding
            query_embedding = create_single_embedding(query_text)
            if not query_embedding:
                return []

            # 全てのチャンクを取得
            chunks = db.query(DocChunk).filter(DocChunk.embedding.is_not(None)).all()

            similarities = []
            for chunk in chunks:
                try:
                    # チャンクのembeddingをデシリアライズ
                    chunk_embedding = deserialize_vector(chunk.embedding)

                    # コサイン類似度を計算
                    similarity = AIChatService.cosine_similarity(
                        query_embedding, chunk_embedding
                    )
                    similarities.append((chunk, similarity))

                except Exception as e:
                    logger.warning(f"Failed to process chunk {chunk.id}: {e}")
                    continue

            # 類似度でソートして上位top_kを返す
            similarities.sort(key=lambda x: x[1], reverse=True)
            return similarities[:top_k]

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

    @staticmethod
    async def generate_ai_response(
        user_message: str, user_name: str = "ユーザー", db: Optional[Session] = None
    ) -> Optional[str]:
        """AIの返信を生成（RAG機能付き）"""
        try:
            if not llm:
                return "申し訳ありません、現在AIサービスが利用できません 😅"

            # RAG: 関連する資料を検索
            relevant_context = ""
            if db:
                try:
                    relevant_chunks = await AIChatService.search_relevant_chunks(
                        db, user_message, top_k=5
                    )

                    if relevant_chunks:
                        context_parts = []
                        for chunk, similarity in relevant_chunks:
                            if similarity > 0.3:  # 類似度の閾値
                                context_parts.append(
                                    f"[関連資料] {chunk.content[:300]}..."
                                )

                        if context_parts:
                            relevant_context = "\n\n".join(context_parts)
                            logger.info(
                                f"Found {len(context_parts)} relevant chunks for query: {user_message[:50]}..."
                            )

                except Exception as e:
                    logger.warning(
                        f"RAG search failed, falling back to general response: {e}"
                    )

            # プロンプトを構築
            if relevant_context:
                prompt = f"""あなたはLudusという名前のAIアシスタントです。
チャットルームで参加者と自然な会話を行います。

以下の関連資料を参考にして、質問に答えてください：

{relevant_context}

以下の点に注意してください：
- 上記の関連資料の内容を基に、具体的で正確な回答をしてください
- 資料に記載されていない内容については推測せず、「資料には記載されていません」と伝えてください
- フレンドリーで親しみやすい口調で話してください
- 必要に応じて絵文字を使って親しみやすさを演出してください
- 長すぎる回答は避け、簡潔にまとめてください
- 日本語で回答してください

{user_name}さんからの質問: {user_message}

返信:"""
            else:
                prompt = f"""あなたはLudusという名前のAIアシスタントです。
チャットルームで参加者と自然な会話を行います。

以下の点に注意してください：
- フレンドリーで親しみやすい口調で話してください
- 質問には一般的な知識で答えてください
- 必要に応じて絵文字を使って親しみやすさを演出してください
- 長すぎる回答は避け、簡潔にまとめてください
- 日本語で回答してください

{user_name}さんからのメッセージ: {user_message}

返信:"""

            # LLMを直接使用してAI応答を生成
            response = await llm.ainvoke(prompt)

            # レスポンスからテキストを抽出
            response_text = (
                response.content if hasattr(response, "content") else str(response)
            )

            return response_text.strip() if response_text else None

        except Exception as e:
            logger.error(f"Failed to generate AI response: {e}")
            return "申し訳ありません、現在返信できません 😅"


# グローバルインスタンス
ai_chat_service = AIChatService()
