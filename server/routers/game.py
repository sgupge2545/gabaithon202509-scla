import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..services.doc_service import create_doc_with_chunks
from ..services.embedding import create_embeddings
from ..services.gcv_ocr import extract_text

router = APIRouter()


@router.post("/start")
async def start_game(
    request: Request,
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    ゲーム開始用の簡易API。
    - クライアントからアップロードされたファイルを受け取り
    - OCRを実行して抽出テキストをサーバーログに出力
    - テキストをembeddingしてベクトル化
    - ドキュメントとチャンクをDBに保存
    - 結果の概要を返す
    """
    if files is None:
        files = []

    results: List[Dict[str, Any]] = []
    for f in files:
        try:
            content = await f.read()
            mime_type = f.content_type or "application/octet-stream"
            texts = extract_text(content, mime_type=mime_type)

            # ログおよびprintでとりあえず出力
            logging.info(
                "[OCR] file=%s mime=%s pages=%d", f.filename, mime_type, len(texts)
            )
            print("===== OCR RESULT: ", f.filename, "=====")
            for i, t in enumerate(texts, start=1):
                print(f"--- page/image {i} ---")
                # 出力量が多くなりすぎないように先頭だけを表示
                print(t[:1000])

            # テキストをembedding（チャンキング使用）
            embeddings = []
            if texts:
                try:
                    embeddings = create_embeddings(texts, merge_small_pages=True)
                    logging.info(
                        "[EMBEDDING] file=%s chunks=%d dimensions=%d",
                        f.filename,
                        len(embeddings),
                        len(embeddings[0]) if embeddings else 0,
                    )
                    print(f"===== EMBEDDING RESULT: {f.filename} =====")
                    print(
                        f"Generated {len(embeddings)} embedding vectors with smart chunking"
                    )
                    if embeddings:
                        print(f"Vector dimensions: {len(embeddings[0])}")
                        print(
                            f"Original pages: {len(texts)}, Final chunks: {len(embeddings)}"
                        )
                except Exception as e:
                    logging.warning("[EMBEDDING] failed for %s: %s", f.filename, e)
                    print(f"Embedding failed for {f.filename}: {e}")

            # DBに保存
            doc_id = None
            if texts and embeddings:
                try:
                    # セッションからユーザー情報を取得
                    session_user = request.session.get("user")
                    if not session_user or not session_user.get("id"):
                        raise HTTPException(status_code=401, detail="認証が必要です")

                    uploader_id = session_user["id"]

                    # チャンクデータを準備（テキストとembeddingのペア）
                    from ..services.embedding import (
                        _merge_small_pages,
                        _split_large_chunks,
                    )

                    # embeddingと同じ処理でチャンクテキストを取得
                    merged_texts = _merge_small_pages(texts, min_page_size=200)
                    processed_texts = _split_large_chunks(
                        merged_texts, max_chunk_size=1500, chunk_overlap=200
                    )

                    chunks_data = list(zip(processed_texts, embeddings))

                    # ドキュメントとチャンクをDBに保存
                    doc = create_doc_with_chunks(
                        db=db,
                        filename=f.filename or "unknown",
                        mime_type=mime_type,
                        uploader_id=uploader_id,
                        chunks_data=chunks_data,
                    )
                    doc_id = doc.id

                    logging.info(
                        "[DB] Saved doc_id=%s with %d chunks", doc_id, len(chunks_data)
                    )
                    print(f"===== DB SAVE RESULT: {f.filename} =====")
                    print(f"Document ID: {doc_id}")
                    print(f"Saved {len(chunks_data)} chunks to database")

                except Exception as e:
                    logging.error("[DB] Save failed for %s: %s", f.filename, e)
                    print(f"DB save failed for {f.filename}: {e}")

            results.append(
                {
                    "filename": f.filename,
                    "mime_type": mime_type,
                    "pages": len(texts),
                    "chunks_count": len(embeddings),
                    "embedding_dimensions": len(embeddings[0]) if embeddings else 0,
                    "doc_id": doc_id,
                }
            )
        except Exception as e:  # noqa: BLE001
            logging.exception("OCR failed for %s", f.filename)
            raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    return {"ok": True, "files": results}
