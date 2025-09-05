"""
ドキュメント管理API
"""

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..services.doc_service import get_user_documents

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
