"""
Google Cloud Vision を用いた OCR サービス。

機能:
- 画像バイト列の OCR (document_text_detection)
- PDF バイト列の OCR: pdf2image で各ページを画像化し、ページごとに Vision OCR を実行

環境変数:
- GOOGLE_CLOUD_VISION_API_KEY: Vision API の API キー

依存関係 (requirements):
- google-cloud-vision
- pdf2image
- pillow

注意:
- pdf2image はシステムに poppler が必要です。実行環境にインストールしてください。
  (例: Debian/Ubuntu: apt-get install -y poppler-utils)
"""

from __future__ import annotations

import base64
import os
from typing import List, Optional

import requests


def _get_api_key() -> str:
    """Vision API の API キーを環境変数から取得。未設定なら例外。"""
    value = os.getenv("GOOGLE_CLOUD_VISION_API_KEY")
    if value:
        return value
    raise RuntimeError(
        "Google Vision API key not found. Set GOOGLE_CLOUD_VISION_API_KEY"
    )


def _ocr_image_bytes(image_bytes: bytes) -> str:
    """画像バイト列からテキストを抽出して 1 つの文字列で返す。

    可能なら段落/行の統合を Vision 側に任せ、full_text_annotation を優先する。
    """
    api_key = _get_api_key()
    url = f"https://vision.googleapis.com/v1/images:annotate?key={api_key}"

    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
            }
        ]
    }

    resp = requests.post(url, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Vision API HTTP error: {resp.status_code} {resp.text}")
    data = resp.json()
    responses = data.get("responses", [])
    if not responses:
        return ""
    r0 = responses[0]
    if "error" in r0:
        raise RuntimeError(f"Vision API error: {r0['error']}")
    # REST は camelCase
    full = r0.get("fullTextAnnotation", {})
    if full and full.get("text"):
        return full.get("text", "")
    text_annotations = r0.get("textAnnotations", [])
    if text_annotations:
        return text_annotations[0].get("description", "") or ""
    return ""


def extract_text_from_image_bytes(image_bytes: bytes) -> str:
    """画像の OCR を実行し、抽出テキストを返す。"""
    return _ocr_image_bytes(image_bytes)


def extract_text_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    dpi: int = 200,
    first_page: int = 1,
    last_page: Optional[int] = None,
    max_pages: Optional[int] = None,
) -> List[str]:
    """PDF をページごとに画像化して OCR。ページごとのテキストを配列で返す。

    引数:
    - dpi: 画像化の解像度 (性能と精度のトレードオフ)
    - first_page/last_page: 処理するページ範囲 (1 始まり)
    - max_pages: 上限ページ数 (負荷制御)
    """
    # 遅延インポート
    from pdf2image import convert_from_bytes

    images = convert_from_bytes(
        pdf_bytes,
        dpi=dpi,
        first_page=first_page,
        last_page=last_page,
        fmt="png",
        thread_count=2,
    )

    if max_pages is not None and max_pages > 0:
        images = images[:max_pages]

    page_texts: List[str] = []
    for pil_img in images:
        # PNG にエンコード
        from io import BytesIO

        buf = BytesIO()
        pil_img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        text = _ocr_image_bytes(img_bytes)
        page_texts.append(text)

    return page_texts


def extract_text(
    file_bytes: bytes,
    mime_type: str,
    *,
    pdf_dpi: int = 200,
    pdf_max_pages: Optional[int] = None,
) -> List[str]:
    """ファイルバイト列からテキストを抽出し、ページ/画像単位の配列で返す。

    - 画像 (image/*): 1 要素の配列 [全文]
    - PDF (application/pdf): ページごとの配列
    """
    if mime_type.startswith("image/"):
        text = extract_text_from_image_bytes(file_bytes)
        return [text]
    if mime_type == "application/pdf":
        return extract_text_from_pdf_bytes(
            file_bytes, dpi=pdf_dpi, max_pages=pdf_max_pages
        )

    # 未対応の MIME はそのまま空配列を返す (上位でハンドリング)
    return []


__all__ = [
    "extract_text_from_image_bytes",
    "extract_text_from_pdf_bytes",
    "extract_text",
]
