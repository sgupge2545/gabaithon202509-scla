import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..services.doc_service import create_doc_with_chunks, get_chunks_from_selected_docs
from ..services.embedding import create_embeddings
from ..services.game_service import game_service
from ..services.gcv_ocr import extract_text

router = APIRouter()


class ProblemConfig(BaseModel):
    content: str
    count: int


class StartQuizRequest(BaseModel):
    room_id: str
    document_source: str
    selected_doc_ids: List[str]
    problems: List[ProblemConfig]


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


@router.post("/start-quiz")
async def start_quiz_game(
    request_data: StartQuizRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    既存資料を使用してクイズゲームを開始
    """
    try:
        # セッションからユーザー情報を取得
        session_user = request.session.get("user")
        if not session_user or not session_user.get("id"):
            raise HTTPException(status_code=401, detail="認証が必要です")

        user_id = session_user["id"]

        # 選択されたドキュメントからチャンクを取得
        if not request_data.selected_doc_ids:
            raise HTTPException(status_code=400, detail="資料が選択されていません")

        chunks = get_chunks_from_selected_docs(db, request_data.selected_doc_ids)
        if not chunks:
            raise HTTPException(
                status_code=400, detail="選択された資料にチャンクが見つかりません"
            )

        logging.info(
            "[QUIZ] User %s starting quiz game with %d documents, %d chunks",
            user_id,
            len(request_data.selected_doc_ids),
            len(chunks),
        )

        # 問題設定の検証
        total_questions = sum(problem.count for problem in request_data.problems)
        if total_questions == 0:
            raise HTTPException(status_code=400, detail="問題数が設定されていません")

        # ルームの参加者を取得（簡易実装）
        participants = [user_id]  # TODO: 実際のルーム参加者を取得

        # ゲームを作成
        game_id = game_service.create_game(
            room_id=request_data.room_id,
            host_user_id=user_id,
            participants=participants,
            settings={
                "time_limit": 20,
                "hint_time": 10,
                "selected_doc_ids": request_data.selected_doc_ids,
                "problems": [p.dict() for p in request_data.problems],
            },
        )

        # バックグラウンドで問題生成を開始
        import asyncio

        asyncio.create_task(
            game_service.generate_and_store_questions(
                db=db,
                game_id=game_id,
                doc_ids=request_data.selected_doc_ids,
                problems=[p.dict() for p in request_data.problems],
            )
        )

        return {
            "ok": True,
            "game_id": game_id,
            "status": "generating",
            "selected_documents": len(request_data.selected_doc_ids),
            "total_chunks_available": len(chunks),
            "total_questions": total_questions,
            "estimated_time": "約30秒",
            "message": "問題を生成中です。しばらくお待ちください。",
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Quiz game start failed")
        raise HTTPException(
            status_code=500, detail=f"クイズゲーム開始に失敗しました: {str(e)}"
        )


@router.get("/status/{game_id}")
async def get_game_status(game_id: str) -> Dict[str, Any]:
    """ゲームの状態を取得"""
    try:
        game_info = game_service.get_game_info(game_id)
        if not game_info:
            raise HTTPException(status_code=404, detail="ゲームが見つかりません")

        return {
            "game_id": game_id,
            "status": game_info.get("status", "unknown"),
            "current_question_index": int(game_info.get("current_question_index", 0)),
            "total_questions": int(game_info.get("total_questions", 0)),
            "participant_count": game_info.get("participant_count", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"Failed to get game status for {game_id}")
        raise HTTPException(
            status_code=500, detail=f"ゲーム状態の取得に失敗しました: {str(e)}"
        )


@router.get("/question/{game_id}")
async def get_current_question(game_id: str) -> Dict[str, Any]:
    """現在の問題を取得"""
    try:
        question = game_service.get_current_question(game_id)
        if not question:
            raise HTTPException(status_code=404, detail="問題が見つかりません")

        return {"game_id": game_id, "question": question}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"Failed to get current question for {game_id}")
        raise HTTPException(
            status_code=500, detail=f"問題の取得に失敗しました: {str(e)}"
        )


@router.post("/start/{game_id}")
async def start_game_by_id(
    game_id: str, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """ゲームを開始"""
    try:
        success = await game_service.start_game(db, game_id)
        if not success:
            raise HTTPException(status_code=400, detail="ゲームの開始に失敗しました")

        return {
            "ok": True,
            "game_id": game_id,
            "status": "playing",
            "message": "ゲームが開始されました",
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"Failed to start game {game_id}")
        raise HTTPException(
            status_code=500, detail=f"ゲーム開始に失敗しました: {str(e)}"
        )


class AnswerRequest(BaseModel):
    answer: str


@router.post("/answer/{game_id}")
async def submit_answer(
    game_id: str,
    answer_data: AnswerRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """回答を提出"""
    try:
        # セッションからユーザー情報を取得
        session_user = request.session.get("user")
        if not session_user or not session_user.get("id"):
            raise HTTPException(status_code=401, detail="認証が必要です")

        user_id = session_user["id"]

        result = await game_service.submit_answer(
            db, game_id, user_id, answer_data.answer, session_user.get("name", "")
        )
        if not result:
            raise HTTPException(status_code=400, detail="回答の提出に失敗しました")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"Failed to submit answer for game {game_id}")
        raise HTTPException(status_code=500, detail=f"回答提出に失敗しました: {str(e)}")
