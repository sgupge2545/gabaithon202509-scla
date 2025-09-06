"""
ゲームサービス - Redisを使ったクイズゲーム状態管理
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import redis
from sqlalchemy.orm import Session

from ..services.collection_manager import manager
from ..services.llm_service import llm_service
from ..services.message_service import create_message
from ..services.vector_search_service import vector_search_service

# Redisクライアント
redis_client = redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True
)


class GameService:
    """クイズゲーム管理サービス"""

    @staticmethod
    def create_game(
        room_id: str, host_user_id: str, participants: List[str], settings: Dict
    ) -> str:
        """
        新しいゲームを作成

        Args:
            room_id: ルームID
            host_user_id: ホストユーザーID
            participants: 参加者のリスト
            settings: ゲーム設定

        Returns:
            作成されたゲームID
        """
        game_id = str(uuid.uuid4())

        # ゲーム基本情報をRedisに保存
        game_data = {
            "room_id": room_id,
            "host_user_id": host_user_id,
            "status": "preparing",  # preparing -> playing -> finished
            "current_question_index": "0",
            "total_questions": "0",
            "created_at": datetime.now().isoformat(),
            "started_at": "",  # Noneの代わりに空文字列
            "finished_at": "",  # Noneの代わりに空文字列
            "settings": json.dumps(settings),
        }

        redis_client.hset(f"game:{game_id}", mapping=game_data)

        # 参加者を登録
        for user_id in participants:
            redis_client.sadd(f"game:{game_id}:participants", user_id)
            # スコアを初期化
            redis_client.hset(
                f"game:{game_id}:scores",
                user_id,
                json.dumps({"total_score": 0, "correct_answers": 0, "rank": 0}),
            )

        # ルームにゲームを紐付け
        redis_client.set(f"room:{room_id}:active_game", game_id)

        logging.info(
            f"Created game {game_id} for room {room_id} with {len(participants)} participants"
        )
        return game_id

    @staticmethod
    async def generate_and_store_questions(
        db: Session, game_id: str, doc_ids: List[str], problems: List[Dict]
    ) -> bool:
        """
        問題を生成してRedisに保存

        Args:
            db: データベースセッション
            game_id: ゲームID
            doc_ids: 使用するドキュメントIDのリスト
            problems: 問題設定のリスト

        Returns:
            成功したかどうか
        """
        try:
            all_questions = []

            for problem in problems:
                problem_type = problem.get("content", "")
                count = problem.get("count", 0)

                if not problem_type or count <= 0:
                    continue

                # ベクトル検索で関連チャンクを取得
                similar_chunks = await vector_search_service.search_similar_chunks(
                    db=db, query_text=problem_type, doc_ids=doc_ids, limit=20
                )

                # チャンクのテキストを抽出
                chunk_texts = [chunk.content for chunk, _ in similar_chunks]

                # フォールバック: 類似チャンクが少ない場合は全チャンクから取得
                if len(chunk_texts) < 5:
                    all_chunks = vector_search_service.get_chunks_from_selected_docs(
                        db=db, doc_ids=doc_ids, limit=20
                    )
                    chunk_texts.extend([chunk.content for chunk in all_chunks])

                # LLMで問題生成
                questions = await llm_service.generate_questions(
                    problem_type=problem_type, count=count, context_chunks=chunk_texts
                )

                # 問題タイプを追加
                for question in questions:
                    question["problem_type"] = problem_type

                all_questions.extend(questions)

            if not all_questions:
                logging.error(f"No questions generated for game {game_id}")
                return False

            # 問題をRedisに保存
            redis_client.set(f"game:{game_id}:questions", json.dumps(all_questions))

            # 総問題数を更新
            redis_client.hset(
                f"game:{game_id}", "total_questions", str(len(all_questions))
            )
            redis_client.hset(f"game:{game_id}", "status", "ready")

            # ゲーム状態をWebSocketで配信
            await GameService.broadcast_game_status(game_id)

            logging.info(
                f"Generated and stored {len(all_questions)} questions for game {game_id}"
            )
            return True

        except Exception as e:
            logging.error(f"Question generation failed for game {game_id}: {e}")
            return False

    @staticmethod
    def get_game_info(game_id: str) -> Optional[Dict]:
        """ゲーム情報を取得"""
        try:
            game_data = redis_client.hgetall(f"game:{game_id}")
            if not game_data:
                return None

            # 参加者数を取得
            participant_count = redis_client.scard(f"game:{game_id}:participants")
            game_data["participant_count"] = participant_count

            return game_data
        except Exception as e:
            logging.error(f"Failed to get game info for {game_id}: {e}")
            return None

    @staticmethod
    async def send_ai_message(
        db: Session, room_id: str, content: str, message_type: str = "game_question"
    ) -> bool:
        """AIメッセージをチャットに送信"""
        try:
            # AIメッセージを直接Redisに保存
            message_id = str(uuid.uuid4())
            created_at = datetime.now().isoformat()
            ai_user_id = "ai_system"

            # Redisにメッセージを保存
            from ..services.message_service import redis_client

            key = f"messages:{message_id}"
            redis_client.hset(
                key,
                mapping={
                    "id": message_id,
                    "room_id": room_id,
                    "user_id": ai_user_id,
                    "content": content,
                    "created_at": created_at,
                    "user_name": "🤖 クイズAI",
                    "user_picture": "",
                    "message_type": message_type,
                },
            )
            redis_client.lpush(f"room:{room_id}:messages", message_id)

            # WebSocketで配信
            await manager.broadcast(
                room_id,
                {
                    "type": "message",
                    "message": {
                        "id": message_id,
                        "content": content,
                        "user_id": ai_user_id,
                        "user_name": "🤖 クイズAI",
                        "created_at": created_at,
                        "message_type": message_type,
                    },
                },
            )

            return True
        except Exception as e:
            logging.error(f"Failed to send AI message: {e}")
            return False

    @staticmethod
    async def start_game(db: Session, game_id: str) -> bool:
        """ゲームを開始"""
        try:
            redis_client.hset(
                f"game:{game_id}",
                mapping={
                    "status": "playing",
                    "started_at": datetime.now().isoformat(),
                    "current_question_index": "0",
                },
            )

            # 最初の問題を送信
            await GameService.send_first_question(db, game_id)

            # ゲーム開始イベントを配信
            await GameService.broadcast_game_status(game_id)

            # タイマーをバックグラウンドで開始
            asyncio.create_task(GameService.start_question_timer(db, game_id))

            logging.info(f"Started game {game_id}")
            return True
        except Exception as e:
            logging.error(f"Failed to start game {game_id}: {e}")
            return False

    @staticmethod
    async def broadcast_game_status(game_id: str) -> bool:
        """ゲーム状態をWebSocketで配信"""
        try:
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            room_id = game_data["room_id"]

            # ゲーム状態を配信
            await manager.broadcast(
                room_id,
                {
                    "type": "game_status_update",
                    "gameStatus": {
                        "game_id": game_id,
                        "status": game_data["status"],
                        "current_question_index": int(
                            game_data.get("current_question_index", 0)
                        ),
                        "total_questions": int(game_data.get("total_questions", 0)),
                        "participants": game_data.get("participants", []),
                        "scores": json.loads(game_data.get("scores", "{}")),
                    },
                },
            )

            return True
        except Exception as e:
            logging.error(f"Failed to broadcast game status for {game_id}: {e}")
            return False

    @staticmethod
    async def start_question_timer(db: Session, game_id: str) -> bool:
        """問題のタイマーを開始（20秒、10秒でヒント）"""
        try:
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            room_id = game_data["room_id"]

            # 20秒のタイマーを開始
            for remaining in range(20, 0, -1):
                await asyncio.sleep(1)

                # ゲーム状態をチェック（ゲームが終了していたら停止）
                current_game = GameService.get_game_info(game_id)
                if not current_game or current_game["status"] != "playing":
                    break

                # タイマー更新を配信
                await manager.broadcast(
                    room_id, {"type": "game_timer", "timeRemaining": remaining - 1}
                )

                # 10秒でヒント送信
                if remaining == 11:
                    await GameService.send_hint(db, game_id)

            # 時間切れの場合、次の問題へ
            current_game = GameService.get_game_info(game_id)
            if current_game and current_game["status"] == "playing":
                await GameService.next_question(db, game_id)

            return True
        except Exception as e:
            logging.error(f"Failed to start question timer for {game_id}: {e}")
            return False

    @staticmethod
    async def send_first_question(db: Session, game_id: str) -> bool:
        """最初の問題をチャットに送信"""
        try:
            # ゲーム情報を取得
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            # 現在の問題を取得
            current_question = GameService.get_current_question(game_id)
            if not current_question:
                return False

            room_id = game_data["room_id"]
            question_num = int(game_data["current_question_index"]) + 1
            total_questions = int(game_data["total_questions"])

            # 問題メッセージを作成
            question_content = f"""🎯 **問題 {question_num}/{total_questions}**

{current_question['question']}

⏰ 制限時間: 20秒
💡 10秒後にヒントが表示されます"""

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, room_id, question_content, "game_question"
            )

            # WebSocketで問題イベントを配信
            await manager.broadcast(
                room_id, {"type": "game_question", "question": current_question}
            )

            return True
        except Exception as e:
            logging.error(f"Failed to send first question for game {game_id}: {e}")
            return False

    @staticmethod
    def get_current_question(game_id: str) -> Optional[Dict]:
        """現在の問題を取得"""
        try:
            game_data = redis_client.hgetall(f"game:{game_id}")
            if not game_data:
                return None

            current_index = int(game_data.get("current_question_index", 0))
            questions_json = redis_client.get(f"game:{game_id}:questions")

            if not questions_json:
                return None

            questions = json.loads(questions_json)
            if current_index >= len(questions):
                return None

            question = questions[current_index].copy()
            question["question_index"] = current_index
            question["total_questions"] = len(questions)

            return question
        except Exception as e:
            logging.error(f"Failed to get current question for game {game_id}: {e}")
            return None

    @staticmethod
    async def send_hint(db: Session, game_id: str) -> bool:
        """ヒントをチャットに送信"""
        try:
            # ゲーム情報を取得
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            # 現在の問題を取得
            current_question = GameService.get_current_question(game_id)
            if not current_question or not current_question.get("hint"):
                return False

            room_id = game_data["room_id"]

            # ヒントメッセージを作成
            hint_content = f"💡 **ヒント**: {current_question['hint']}"

            # AIメッセージとして送信
            await GameService.send_ai_message(db, room_id, hint_content, "game_hint")

            return True
        except Exception as e:
            logging.error(f"Failed to send hint for game {game_id}: {e}")
            return False

    @staticmethod
    async def send_answer_result(
        db: Session, game_id: str, user_name: str, is_correct: bool, points: int
    ) -> bool:
        """回答結果をチャットに送信"""
        try:
            # ゲーム情報を取得
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            room_id = game_data["room_id"]

            if is_correct:
                result_content = (
                    f"🎉 **正解！** {user_name}さんが {points}点 獲得しました！"
                )
            else:
                result_content = f"❌ {user_name}さんの回答は不正解でした"

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, room_id, result_content, "game_result"
            )

            return True
        except Exception as e:
            logging.error(f"Failed to send answer result for game {game_id}: {e}")
            return False

    @staticmethod
    async def send_next_question(db: Session, game_id: str) -> bool:
        """次の問題をチャットに送信"""
        try:
            # ゲーム情報を取得
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return False

            # 現在の問題を取得
            current_question = GameService.get_current_question(game_id)
            if not current_question:
                return False

            room_id = game_data["room_id"]
            question_num = int(game_data["current_question_index"]) + 1
            total_questions = int(game_data["total_questions"])

            # 問題メッセージを作成
            question_content = f"""🎯 **問題 {question_num}/{total_questions}**

{current_question['question']}

⏰ 制限時間: 20秒
💡 10秒後にヒントが表示されます"""

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, room_id, question_content, "game_question"
            )

            return True
        except Exception as e:
            logging.error(f"Failed to send next question for game {game_id}: {e}")
            return False

    @staticmethod
    async def submit_answer(
        db: Session, game_id: str, user_id: str, answer: str, user_name: str = ""
    ) -> Optional[Dict]:
        """回答を提出して採点"""
        try:
            # 後から入った人を自動的にゲームに参加させる
            GameService.add_participant_to_game(game_id, user_id)

            # 現在の問題を取得
            current_question = GameService.get_current_question(game_id)
            if not current_question:
                return None

            question_index = current_question["question_index"]

            # LLMで採点
            grading_result = await llm_service.grade_answer(
                question=current_question["question"],
                reference_answer=current_question["reference_answer"],
                user_answer=answer,
                context=current_question.get("context", ""),
            )

            # 回答をRedisに保存
            answer_data = {
                "answer": answer,
                "timestamp": datetime.now().isoformat(),
                "score": grading_result["score"],
                "is_correct": grading_result["is_correct"],
                "feedback": grading_result["feedback"],
            }

            redis_client.hset(
                f"game:{game_id}:answers:{question_index}",
                user_id,
                json.dumps(answer_data),
            )

            # スコアを更新
            GameService._update_user_score(game_id, user_id, grading_result["score"])

            # 回答結果をチャットに送信
            await GameService.send_answer_result(
                db,
                game_id,
                user_name or user_id,
                grading_result["is_correct"],
                grading_result["score"],
            )

            logging.info(
                f"Answer submitted for game {game_id}, user {user_id}: {grading_result['score']} points"
            )
            return grading_result

        except Exception as e:
            logging.error(f"Failed to submit answer for game {game_id}: {e}")
            return None

    @staticmethod
    def _update_user_score(game_id: str, user_id: str, points: int):
        """ユーザーのスコアを更新"""
        try:
            current_score_json = redis_client.hget(f"game:{game_id}:scores", user_id)
            if current_score_json:
                current_score = json.loads(current_score_json)
            else:
                current_score = {"total_score": 0, "correct_answers": 0, "rank": 0}

            current_score["total_score"] += points
            if points > 70:  # 部分正解以上
                current_score["correct_answers"] += 1

            redis_client.hset(
                f"game:{game_id}:scores", user_id, json.dumps(current_score)
            )
        except Exception as e:
            logging.error(
                f"Failed to update score for user {user_id} in game {game_id}: {e}"
            )

    @staticmethod
    async def next_question(db: Session, game_id: str) -> bool:
        """次の問題に進む"""
        try:
            game_data = redis_client.hgetall(f"game:{game_id}")
            current_index = int(game_data.get("current_question_index", 0))
            total_questions = int(game_data.get("total_questions", 0))

            if current_index + 1 >= total_questions:
                # ゲーム終了
                redis_client.hset(
                    f"game:{game_id}",
                    mapping={
                        "status": "finished",
                        "finished_at": datetime.now().isoformat(),
                    },
                )

                # ゲーム終了イベントを配信
                await GameService.broadcast_game_status(game_id)

                return False
            else:
                # 次の問題へ
                redis_client.hset(
                    f"game:{game_id}", "current_question_index", str(current_index + 1)
                )

                # 次の問題を送信
                await GameService.send_next_question(db, game_id)

                # ゲーム状態を配信
                await GameService.broadcast_game_status(game_id)

                # 新しい問題のタイマーを開始
                asyncio.create_task(GameService.start_question_timer(db, game_id))

                return True

        except Exception as e:
            logging.error(f"Failed to advance to next question in game {game_id}: {e}")
            return False

    @staticmethod
    def add_participant_to_game(game_id: str, user_id: str) -> bool:
        """ゲームに新しい参加者を追加"""
        try:
            # 既に参加しているかチェック
            if redis_client.sismember(f"game:{game_id}:participants", user_id):
                return True  # 既に参加済み

            # 参加者として追加
            redis_client.sadd(f"game:{game_id}:participants", user_id)

            # スコアを初期化
            redis_client.hset(
                f"game:{game_id}:scores",
                user_id,
                json.dumps({"total_score": 0, "correct_answers": 0, "rank": 0}),
            )

            logging.info(f"Added new participant {user_id} to game {game_id}")
            return True
        except Exception as e:
            logging.error(f"Failed to add participant {user_id} to game {game_id}: {e}")
            return False

    @staticmethod
    def cleanup_room_games(room_id: str) -> bool:
        """ルーム削除時にそのルームのゲーム情報をRedisから削除"""
        try:
            # ルームに関連するゲームを検索
            game_keys = redis_client.keys("game:*")
            deleted_count = 0

            for game_key in game_keys:
                game_data = redis_client.hgetall(game_key)
                if game_data.get("room_id") == room_id:
                    game_id = game_key.split(":")[-1]

                    # ゲーム関連のキーを全て削除
                    keys_to_delete = [
                        f"game:{game_id}",
                        f"game:{game_id}:questions",
                        f"game:{game_id}:participants",
                        f"game:{game_id}:scores",
                    ]

                    # 回答データも削除
                    answer_keys = redis_client.keys(f"game:{game_id}:answers:*")
                    keys_to_delete.extend(answer_keys)

                    # 一括削除
                    if keys_to_delete:
                        redis_client.delete(*keys_to_delete)
                        deleted_count += 1
                        logging.info(f"Deleted game {game_id} for room {room_id}")

            logging.info(f"Cleaned up {deleted_count} games for room {room_id}")
            return True

        except Exception as e:
            logging.error(f"Failed to cleanup games for room {room_id}: {e}")
            return False


# グローバルインスタンス
game_service = GameService()
