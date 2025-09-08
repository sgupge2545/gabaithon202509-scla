"""
メッセージ関連のAPIエンドポイント
"""

import asyncio
import json
import logging
from typing import List

import redis
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db, room_service, user_service
from ..services.ai_chat_service import ai_chat_service
from ..services.collection_manager import manager
from ..services.game_service import game_service
from ..services.message_service import (
    create_message,
    get_room_messages,
    redis_client,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def get_grading_result_for_message(message_id: str, user_id: str) -> dict | None:
    """メッセージの採点結果を取得"""
    try:
        # 全てのゲームから該当メッセージの採点結果を検索
        active_games = redis_client.keys("game:*")
        for game_key in active_games:
            if game_key.endswith(":scores") or game_key.endswith(":answers"):
                continue

            try:
                game_data = redis_client.hgetall(game_key)
                if not game_data:
                    continue

                game_id = game_key.split(":")[-1]

                # 各問題の回答を確認
                question_keys = redis_client.keys(f"game:{game_id}:answers:*")
                for question_key in question_keys:
                    try:
                        answers = redis_client.hgetall(question_key)
                        if user_id in answers:
                            answer_data = json.loads(answers[user_id])
                            if answer_data.get("message_id") == message_id:
                                # 採点結果を返す
                                return {
                                    "is_correct": answer_data.get("is_correct", False),
                                    "score": answer_data.get("score", 0),
                                    "feedback": answer_data.get("feedback", ""),
                                    "user_name": answer_data.get("user_name", ""),
                                }
                    except (json.JSONDecodeError, redis.ResponseError):
                        continue
            except redis.ResponseError:
                continue

        return None
    except Exception as e:
        logger.warning(f"Failed to get grading result for message {message_id}: {e}")
        return None


# レスポンスモデル
class MessageResponse(BaseModel):
    id: str
    room_id: str
    user_id: str | None
    content: str
    referenced_docs: List[dict] | None = None  # 参考資料の情報
    created_at: str
    user: dict | None = None
    grading_result: dict | None = None  # 採点結果を追加

    class Config:
        from_attributes = True


# リクエストモデル
class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


async def process_game_answer_async(
    game_id: str, user_id: str, content: str, user_name: str, message_id: str
):
    """ゲームの回答を非同期で処理"""
    try:
        # 新しいDBセッションを作成
        from ..database import get_db

        db_gen = get_db()
        db = next(db_gen)
        try:
            await game_service.submit_answer(
                db, game_id, user_id, content, user_name, message_id
            )
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to process async game answer: {e}")


async def process_ai_chat_async(room_id: str, user_message: str, user_name: str):
    """AI チャット返信を非同期で処理"""
    try:
        # 新しいDBセッションを作成
        from ..database import get_db

        db_gen = get_db()
        db = next(db_gen)
        try:
            # システムユーザーの存在を確認
            ai_chat_service.ensure_system_user(db)

            # AI応答を生成（RAG機能付き）
            ai_response, referenced_docs = await ai_chat_service.generate_ai_response(
                user_message, user_name, db
            )

            if ai_response:
                # AIメッセージを作成（システムユーザーとして）
                ai_message = create_message(
                    db=db,
                    room_id=room_id,
                    user_id="system",  # システムユーザーID
                    content=ai_response,
                    referenced_docs=referenced_docs,
                )

                # AI応答をブロードキャスト
                payload = {
                    "id": ai_message.id,
                    "room_id": ai_message.room_id,
                    "user_id": "system",
                    "content": ai_message.content,
                    "referenced_docs": referenced_docs,
                    "created_at": ai_message.created_at,
                    "user": {
                        "id": "system",
                        "name": "Ludus",
                        "picture": None,
                    },
                }

                await manager.broadcast(room_id, payload)

        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to process AI chat response: {e}")


def get_current_user(request: Request, db: Session) -> dict:
    """現在のユーザーを取得し、DB上の存在も保証する"""
    session_user = request.session.get("user")
    if not session_user:
        raise HTTPException(status_code=401, detail="認証が必要です")

    idp_id = session_user.get("idp_id")
    email = session_user.get("email")
    name = session_user.get("name")
    picture_url = session_user.get("picture_url")

    if not idp_id or not email or not name:
        raise HTTPException(status_code=401, detail="認証が必要です")

    db_user = user_service.create_or_update_user(
        db=db, idp_id=idp_id, email=email, name=name, picture_url=picture_url
    )

    request.session["user"] = {
        "id": db_user.id,
        "idp_id": db_user.idp_id,
        "email": db_user.email,
        "name": db_user.name,
        "picture_url": db_user.picture_url,
    }

    return request.session["user"]


@router.get("/{room_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """ルームのメッセージ一覧を取得"""
    current_user = get_current_user(request, db)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    try:
        messages = get_room_messages(db, room_id, limit, offset)
    except Exception:
        logger.exception("/rooms/{room_id}/messages 取得でエラーが発生しました")
        raise HTTPException(status_code=500, detail="メッセージ取得に失敗しました")

    result = []
    for message in messages:
        user_info = None
        grading_result = None

        try:
            data = redis_client.hgetall(f"messages:{message.id}")
            if data:
                name = data.get("user_name", "")
                picture = data.get("user_picture", "")
                if name or picture or message.user_id:
                    user_info = {
                        "id": message.user_id,
                        "name": name,
                        "picture": picture or None,
                    }
        except Exception:
            pass

        # 自分のメッセージの場合のみ採点結果を取得
        if message.user_id == current_user["id"]:
            grading_result = get_grading_result_for_message(message.id, message.user_id)

        result.append(
            MessageResponse(
                id=message.id,
                room_id=message.room_id,
                user_id=message.user_id,
                content=message.content,
                referenced_docs=message.referenced_docs,
                created_at=message.created_at,
                user=user_info,
                grading_result=grading_result,
            )
        )

    return result


@router.websocket("/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket 接続: room_id ごとにクライアントを管理する"""
    try:
        # 接続をマネージャーに登録（accept()も含む）
        await manager.connect(room_id, websocket)
        logger.info(f"WebSocket connected for room {room_id}")

        while True:
            try:
                # クライアントからのメッセージを待機
                message = await websocket.receive_text()

                try:
                    # JSONメッセージの場合、ハートビートに対応
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        # ハートビートに応答
                        await websocket.send_text(json.dumps({"type": "pong"}))
                        continue
                except (json.JSONDecodeError, KeyError):
                    # JSON以外のメッセージは無視
                    pass

            except Exception as e:
                # 正常な切断コード（1000, 1001）の場合はエラーログを出さない
                if str(e) not in ["1000", "1001"]:
                    logger.error(
                        f"Error processing WebSocket message for room {room_id}: {e}"
                    )
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error for room {room_id}: {e}")
    finally:
        # 接続をクリーンアップ
        try:
            await manager.disconnect(room_id, websocket)
        except Exception as e:
            logger.warning(f"Error during WebSocket cleanup for room {room_id}: {e}")


@router.post("/{room_id}/messages", response_model=MessageResponse)
async def send_message(
    room_id: str,
    message_data: SendMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """メッセージを送信"""
    current_user = get_current_user(request, db)

    # ルーム参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    # メッセージ作成（先に送信）
    try:
        message = create_message(
            db=db,
            room_id=room_id,
            user_id=current_user["id"],
            content=message_data.content,
        )
    except Exception:
        logger.exception("/rooms/{room_id}/messages 送信でエラーが発生しました")
        raise HTTPException(status_code=500, detail="メッセージ送信に失敗しました")

    # ユーザー情報（スナップショット）をRedisから取得
    user_info = None
    try:
        data = redis_client.hgetall(f"messages:{message.id}")
        if data:
            name = data.get("user_name", "")
            picture = data.get("user_picture", "")
            user_info = {
                "id": message.user_id,
                "name": name,
                "picture": picture or None,
            }
    except Exception:
        pass

    # ブロードキャスト
    payload = {
        "id": message.id,
        "room_id": message.room_id,
        "user_id": message.user_id,
        "content": message.content,
        "created_at": message.created_at,
        "user": user_info,
    }

    # 可能なら非同期で全クライアントに配信
    try:
        await manager.broadcast(room_id, payload)
    except Exception:
        # ブロードキャスト失敗は致命的ではない
        pass

    # ゲーム中の回答処理を非同期で実行（メッセージ送信後）
    try:
        # ルームで進行中のゲームがあるかチェック
        active_games = redis_client.keys("game:*")

        for game_key in active_games:
            # スコアやアンサーキーをスキップ
            if game_key.endswith(":scores") or game_key.endswith(":answers"):
                continue

            try:
                game_data = redis_client.hgetall(game_key)

                if (
                    game_data.get("room_id") == room_id
                    and game_data.get("status") == "playing"
                ):
                    game_id = game_key.split(":")[-1]

                    # 回答処理を非同期で実行（メッセージIDを含める）
                    asyncio.create_task(
                        process_game_answer_async(
                            game_id,
                            current_user["id"],
                            message_data.content,
                            current_user.get("name", ""),
                            message.id,
                        )
                    )
                    break
            except redis.ResponseError as re:
                logger.warning(f"Redis type error for game {game_key}: {re}")
                continue
            except Exception as e:
                logger.error(f"Error processing game key {game_key}: {e}")
                continue
    except Exception as e:
        logger.warning(f"Failed to start async game answer processing: {e}")

    # AI チャット返信処理（ゲーム中でない場合のみ）
    try:
        # ゲーム中でない場合のみAI返信をチェック
        is_game_active = False
        active_games = redis_client.keys("game:*")
        for game_key in active_games:
            if game_key.endswith(":scores") or game_key.endswith(":answers"):
                continue
            try:
                game_data = redis_client.hgetall(game_key)
                if (
                    game_data.get("room_id") == room_id
                    and game_data.get("status") == "playing"
                ):
                    is_game_active = True
                    break
            except Exception:
                continue

        # ゲーム中でなく、@ludusメンションがある場合はAI返信
        if not is_game_active and ai_chat_service.should_respond_to_message(
            message_data.content
        ):
            user_message = ai_chat_service.extract_user_message(message_data.content)
            user_name = current_user.get("name", "ユーザー")

            # AI返信を非同期で処理
            asyncio.create_task(process_ai_chat_async(room_id, user_message, user_name))

    except Exception as e:
        logger.warning(f"Failed to start AI chat processing: {e}")

    return MessageResponse(
        id=message.id,
        room_id=message.room_id,
        user_id=message.user_id,
        content=message.content,
        created_at=message.created_at,
        user=user_info,
        grading_result=None,  # 送信時点では採点結果はまだない
    )
