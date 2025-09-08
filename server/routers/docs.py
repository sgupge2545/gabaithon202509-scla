"""
ドキュメント管理API
"""

import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..services.doc_service import create_doc_with_chunks, get_user_documents
from ..services.embedding import create_embeddings
from ..services.gcv_ocr import extract_text

router = APIRouter()


def get_current_user(request: Request) -> Dict:
    """セッションから現在のユーザー情報を取得"""
    if "user" not in request.session:
        raise HTTPException(status_code=401, detail="認証が必要です")
    return request.session["user"]


@router.get("/my-documents")
async def get_my_documents(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> Dict:
    """現在のユーザーがアップロードしたドキュメント一覧を取得"""
    current_user = get_current_user(request)
    user_id = current_user["id"]

    try:
        documents = get_user_documents(db, user_id, limit, offset)

        # 統計情報を計算
        total_count = len(documents)
        total_chunks = sum(doc["chunk_count"] for doc in documents)

        return {
            "documents": documents,
            "total_count": total_count,
            "total_chunks": total_chunks,
            "limit": limit,
            "offset": offset,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"ドキュメント一覧の取得に失敗しました: {str(e)}"
        )


@router.post("/upload")
async def upload_documents(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> Dict:
    """ドキュメントをアップロードしてDBに保存"""
    current_user = get_current_user(request)
    user_id = current_user["id"]

    if not files:
        raise HTTPException(status_code=400, detail="ファイルが選択されていません")

    results = []

    for file in files:
        try:
            # ファイル内容を読み取り
            content = await file.read()
            mime_type = file.content_type or "application/octet-stream"

            # OCRでテキスト抽出
            texts = extract_text(content, mime_type=mime_type)

            if not texts:
                results.append(
                    {
                        "filename": file.filename,
                        "success": False,
                        "error": "テキストを抽出できませんでした",
                    }
                )
                continue

            # テキストをembedding
            embeddings = []
            if texts:
                try:
                    embeddings = create_embeddings(texts)
                except Exception as e:
                    logging.error(f"Embedding failed for {file.filename}: {e}")
                    results.append(
                        {
                            "filename": file.filename,
                            "success": False,
                            "error": f"埋め込み処理に失敗しました: {str(e)}",
                        }
                    )
                    continue

            # DBに保存
            if texts and embeddings:
                try:
                    from ..services.embedding import (
                        _merge_small_pages,
                        _split_large_chunks,
                    )

                    # チャンクテキストを準備
                    merged_texts = _merge_small_pages(texts, min_page_size=200)
                    processed_texts = _split_large_chunks(
                        merged_texts, max_chunk_size=1500, chunk_overlap=200
                    )

                    chunks_data = list(zip(processed_texts, embeddings))

                    # ドキュメントとチャンクをDBに保存
                    doc = create_doc_with_chunks(
                        db=db,
                        filename=file.filename or "unknown",
                        mime_type=mime_type,
                        uploader_id=user_id,
                        chunks_data=chunks_data,
                    )

                    results.append(
                        {
                            "filename": file.filename,
                            "success": True,
                            "doc_id": doc.id,
                            "chunks_count": len(chunks_data),
                        }
                    )

                    logging.info(
                        f"Successfully uploaded {file.filename} with {len(chunks_data)} chunks"
                    )

                except Exception as e:
                    logging.error(f"DB save failed for {file.filename}: {e}")
                    results.append(
                        {
                            "filename": file.filename,
                            "success": False,
                            "error": f"データベース保存に失敗しました: {str(e)}",
                        }
                    )
            else:
                results.append(
                    {
                        "filename": file.filename,
                        "success": False,
                        "error": "テキスト抽出または埋め込み処理に失敗しました",
                    }
                )

        except Exception as e:
            logging.error(f"Upload failed for {file.filename}: {e}")
            results.append(
                {
                    "filename": file.filename,
                    "success": False,
                    "error": f"アップロード処理に失敗しました: {str(e)}",
                }
            )

    # 成功・失敗の統計
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "successful": len(successful),
            "failed": len(failed),
        },
    }
