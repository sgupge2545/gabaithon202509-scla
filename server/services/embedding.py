"""
Cohere を用いたテキストembeddingサービス。

機能:
- テキストのベクトル化（embedding）
- LangChainのCohereEmbeddingsを使用

環境変数:
- COHERE_API_KEY: Cohere API の API キー

依存関係 (requirements):
- langchain
- langchain-cohere
- cohere
"""

from __future__ import annotations

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

    api_key = _get_cohere_api_key()

    # CohereEmbeddingsを初期化
    embeddings = CohereEmbeddings(
        cohere_api_key=api_key,
        model="embed-multilingual-v3.0",  # 多言語対応モデル
    )

    try:
        # テキストをembedding
        vectors = embeddings.embed_documents(processed_texts)
        return vectors
    except Exception as e:
        raise RuntimeError(f"Cohere embedding failed: {e}") from e


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


__all__ = [
    "create_embeddings",
    "create_single_embedding",
]
