"""
Cohere を用いたテキストembeddingサービス。

機能:
- テキストのベクトル化（embedding）
- LangChainのCohereEmbeddingsを使用
- レート制限対策のリトライ機能

環境変数:
- COHERE_API_KEY: Cohere API の API キー

依存関係 (requirements):
- langchain
- langchain-cohere
- cohere
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import List

from langchain_cohere import CohereEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


def _get_cohere_api_key() -> str:
    """Cohere API の API キーを環境変数から取得。未設定なら例外。"""
    value = os.getenv("COHERE_API_KEY")
    if value:
        return value
    raise RuntimeError("Cohere API key not found. Set COHERE_API_KEY")


def _merge_small_pages(texts: List[str], min_page_size: int = 200) -> List[str]:
    """小さなページを隣接ページとマージして適切なサイズにする。

    Args:
        texts: ページ単位のテキストリスト
        min_page_size: この文字数未満のページは隣接ページとマージ

    Returns:
        マージされたテキストのリスト
    """
    if not texts:
        return []

    # 空のページを除去
    non_empty_texts = [text.strip() for text in texts if text.strip()]
    if not non_empty_texts:
        return []

    merged_texts = []
    current_chunk = ""

    for text in non_empty_texts:
        text = text.strip()

        # 現在のチャンクが空の場合、新しいテキストを開始
        if not current_chunk:
            current_chunk = text
        else:
            # 現在のチャンクまたは新しいテキストが小さい場合はマージ
            if len(current_chunk) < min_page_size or len(text) < min_page_size:
                current_chunk += "\n\n" + text
            else:
                # 両方とも十分な大きさの場合、現在のチャンクを保存して新しいチャンクを開始
                merged_texts.append(current_chunk)
                current_chunk = text

    # 最後のチャンクを追加
    if current_chunk:
        merged_texts.append(current_chunk)

    return merged_texts


def _split_large_chunks(
    texts: List[str], max_chunk_size: int = 1500, chunk_overlap: int = 200
) -> List[str]:
    """大きすぎるチャンクを適切なサイズに分割する。

    Args:
        texts: マージされたテキストのリスト
        max_chunk_size: この文字数を超える場合は分割
        chunk_overlap: 分割時のオーバーラップ

    Returns:
        適切なサイズに分割されたテキストのリスト
    """
    if not texts:
        return []

    final_chunks = []

    for text in texts:
        if len(text) <= max_chunk_size:
            # 適切なサイズの場合はそのまま追加
            final_chunks.append(text)
        else:
            # 大きすぎる場合は分割
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=max_chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
                separators=["\n\n", "\n", "。", ".", " ", ""],
            )

            chunks = text_splitter.split_text(text)
            final_chunks.extend(chunks)

    return final_chunks


async def _create_embeddings_with_retry(
    processed_texts: List[str], max_retries: int = 5, retry_delay: float = 10.0
) -> List[List[float]]:
    """リトライ機能付きでembeddingを作成する。

    Args:
        processed_texts: 処理済みテキストのリスト
        max_retries: 最大リトライ回数
        retry_delay: リトライ間隔（秒）

    Returns:
        各チャンクのembeddingベクトルのリスト

    Raises:
        RuntimeError: 最大リトライ回数に達した場合
    """
    api_key = _get_cohere_api_key()

    # CohereEmbeddingsを初期化
    embeddings = CohereEmbeddings(
        cohere_api_key=api_key,
        model="embed-multilingual-v3.0",  # 多言語対応モデル
    )

    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            # テキストをembedding
            vectors = embeddings.embed_documents(processed_texts)
            if attempt > 0:
                logging.info(f"Embedding succeeded on attempt {attempt + 1}")
            return vectors

        except Exception as e:
            last_exception = e

            # レート制限エラーかどうかをチェック
            error_str = str(e).lower()
            is_rate_limit = any(
                keyword in error_str
                for keyword in [
                    "rate limit",
                    "too many requests",
                    "429",
                    "quota",
                    "throttle",
                ]
            )

            if attempt < max_retries:
                if is_rate_limit:
                    logging.warning(
                        f"Rate limit hit on attempt {attempt + 1}, retrying in {retry_delay}s: {e}"
                    )
                else:
                    logging.warning(
                        f"Embedding failed on attempt {attempt + 1}, retrying in {retry_delay}s: {e}"
                    )

                # 非同期でリトライ待機
                await asyncio.sleep(retry_delay)
            else:
                logging.error(f"Embedding failed after {max_retries + 1} attempts: {e}")
                break

    raise RuntimeError(
        f"Cohere embedding failed after {max_retries + 1} attempts: {last_exception}"
    )


def create_embeddings(
    texts: List[str], merge_small_pages: bool = True
) -> List[List[float]]:
    """テキストのリストをembeddingしてベクトルのリストを返す。

    Args:
        texts: embeddingするテキストのリスト（ページ単位）
        merge_small_pages: True の場合、小さなページを隣接ページとマージ

    Returns:
        各チャンクのembeddingベクトルのリスト

    Raises:
        RuntimeError: API キーが設定されていない場合
        Exception: Cohere API でエラーが発生した場合
    """
    if not texts:
        return []

    # 小さなページのマージを使用する場合
    if merge_small_pages:
        # ステップ1: 小さなページを隣接ページとマージ
        merged_texts = _merge_small_pages(texts, min_page_size=200)

        # ステップ2: 大きすぎるページをそのページ内で分割
        processed_texts = _split_large_chunks(
            merged_texts, max_chunk_size=1500, chunk_overlap=200
        )
    else:
        # 元のテキストをそのまま使用（短すぎるものは除外）
        processed_texts = [text for text in texts if len(text.strip()) >= 50]

    if not processed_texts:
        return []

    # 同期関数から非同期関数を呼び出す
    try:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(_create_embeddings_with_retry(processed_texts))
    except RuntimeError:
        # イベントループが存在しない場合は新しく作成
        return asyncio.run(_create_embeddings_with_retry(processed_texts))


def create_single_embedding(text: str) -> List[float]:
    """単一のテキストをembeddingしてベクトルを返す。

    Args:
        text: embeddingするテキスト

    Returns:
        テキストのembeddingベクトル

    Raises:
        RuntimeError: API キーが設定されていない場合
        Exception: Cohere API でエラーが発生した場合
    """
    if not text.strip():
        return []

    api_key = _get_cohere_api_key()

    # CohereEmbeddingsを初期化
    embeddings = CohereEmbeddings(
        cohere_api_key=api_key,
        model="embed-multilingual-v3.0",  # 多言語対応モデル
    )

    try:
        # 単一テキストをembedding
        vector = embeddings.embed_query(text)
        return vector
    except Exception as e:
        raise RuntimeError(f"Cohere embedding failed: {e}") from e


async def create_embeddings_async(
    texts: List[str], merge_small_pages: bool = True
) -> List[List[float]]:
    """テキストのリストを非同期でembeddingしてベクトルのリストを返す。

    Args:
        texts: embeddingするテキストのリスト（ページ単位）
        merge_small_pages: True の場合、小さなページを隣接ページとマージ

    Returns:
        各チャンクのembeddingベクトルのリスト

    Raises:
        RuntimeError: API キーが設定されていない場合
        Exception: Cohere API でエラーが発生した場合
    """
    if not texts:
        return []

    # 小さなページのマージを使用する場合
    if merge_small_pages:
        # ステップ1: 小さなページを隣接ページとマージ
        merged_texts = _merge_small_pages(texts, min_page_size=200)

        # ステップ2: 大きすぎるページをそのページ内で分割
        processed_texts = _split_large_chunks(
            merged_texts, max_chunk_size=1500, chunk_overlap=200
        )
    else:
        # 元のテキストをそのまま使用（短すぎるものは除外）
        processed_texts = [text for text in texts if len(text.strip()) >= 50]

    if not processed_texts:
        return []

    return await _create_embeddings_with_retry(processed_texts)


__all__ = [
    "create_embeddings",
    "create_embeddings_async",
    "create_single_embedding",
]
