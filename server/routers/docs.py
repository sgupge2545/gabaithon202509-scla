"""
ドキュメント管理API
"""

import logging
import os
from typing import Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..database.models import Doc
from ..services.doc_service import create_doc_with_chunks, get_user_documents
from ..services.embedding import create_embeddings
from ..services.gcv_ocr import extract_text

router = APIRouter()

# アップロードファイル保存用のディレクトリ
UPLOAD_DIR = "uploads"


def ensure_upload_dir():
    """アップロードディレクトリが存在することを確認"""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
        logging.info(f"Created upload directory: {UPLOAD_DIR}")


def get_file_extension(mime_type: str, filename: str = None) -> str:
    """MIMEタイプまたはファイル名から拡張子を取得"""
    # ファイル名から拡張子を取得
    if filename and "." in filename:
        return os.path.splitext(filename)[1].lower()

    # MIMEタイプから拡張子を推定
    mime_to_ext = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "text/plain": ".txt",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    }
    return mime_to_ext.get(mime_type, ".bin")


def save_uploaded_file(
    file_content: bytes, doc_id: str, mime_type: str, filename: str = None
) -> str:
    """アップロードされたファイルを保存"""
    ensure_upload_dir()

    # 拡張子を取得
    extension = get_file_extension(mime_type, filename)

    # ファイルパスを生成
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}{extension}")

    # ファイルを保存
    with open(file_path, "wb") as f:
        f.write(file_content)

    logging.info(f"Saved file: {file_path}")
    return file_path


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

                    # ファイルを物理的に保存
                    try:
                        file_path = save_uploaded_file(
                            content, doc.id, mime_type, file.filename
                        )

                        # DBのstorage_uriを更新
                        doc.storage_uri = file_path
                        db.commit()

                    except Exception as e:
                        logging.error(f"Failed to save file {file.filename}: {e}")
                        # ファイル保存に失敗してもDBの処理は続行

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


@router.get("/file/{doc_id}")
async def get_document_file(
    doc_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """ドキュメントファイルを取得"""
    current_user = get_current_user(request)

    # ドキュメントを取得
    doc = db.query(Doc).filter(Doc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="ドキュメントが見つかりません")

    # アップロード者本人のみアクセス可能
    if doc.uploaded_by != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="このファイルにアクセスする権限がありません"
        )

    # ファイルが存在するかチェック
    if not doc.storage_uri or not os.path.exists(doc.storage_uri):
        # 古いドキュメントでファイルが物理的に存在しない場合
        logging.warning(f"File not found for document {doc_id}: {doc.storage_uri}")
        raise HTTPException(
            status_code=404,
            detail="ファイルが見つかりません。このドキュメントは古いバージョンでアップロードされた可能性があります。",
        )

    # ファイルを返す（インライン表示用）
    response = FileResponse(
        path=doc.storage_uri, filename=doc.filename, media_type=doc.mime_type
    )
    # インライン表示を指定（ダウンロードではなくブラウザで表示）
    # 日本語ファイル名に対応するためRFC 5987形式を使用
    try:
        # ASCII文字のみの場合は通常の形式
        doc.filename.encode("ascii")
        response.headers["Content-Disposition"] = f'inline; filename="{doc.filename}"'
    except UnicodeEncodeError:
        # 日本語などの非ASCII文字が含まれる場合はRFC 5987形式
        import urllib.parse

        encoded_filename = urllib.parse.quote(doc.filename, safe="")
        response.headers[
            "Content-Disposition"
        ] = f"inline; filename*=UTF-8''{encoded_filename}"
    # ブラウザでの表示を改善するためのヘッダー
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
