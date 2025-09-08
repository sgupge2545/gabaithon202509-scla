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

from ..database import room_service
from ..services.collection_manager import manager
from ..services.llm_service import llm_service
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
            "status": "preparing",  # preparing -> playing -> waiting_next -> finished
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
    async def generate_and_store_questions_background(
        game_id: str,
        doc_ids: List[str],
        problems: List[Dict],
        use_general_knowledge: bool = False,
    ) -> bool:
        """バックグラウンドタスク用の問題生成（新しいDBセッションを作成）"""
        from ..database.database import SessionLocal

        db = SessionLocal()
        try:
            return await GameService.generate_and_store_questions(
                db=db,
                game_id=game_id,
                doc_ids=doc_ids,
                problems=problems,
                use_general_knowledge=use_general_knowledge,
            )
        finally:
            db.close()

    @staticmethod
    async def generate_and_store_questions(
        db: Session,
        game_id: str,
        doc_ids: List[str],
        problems: List[Dict],
        use_general_knowledge: bool = False,
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
            # ゲーム状態を"generating"に更新
            redis_client.hset(f"game:{game_id}", "status", "generating")

            # 問題作成開始メッセージを送信
            logging.info(f"Sending game start message for game {game_id}")
            await GameService.send_ai_message(
                db,
                game_id,
                "問題を作成中です... しばらくお待ちください。",
            )
            logging.info(f"Game start message sent successfully for game {game_id}")

            # 問題生成開始状態をWebSocketで配信
            await GameService.broadcast_game_status(game_id)

            all_questions = []

            for problem in problems:
                problem_type = problem.get("content", "")
                count = problem.get("count", 0)

                if not problem_type or count <= 0:
                    continue

                if use_general_knowledge:
                    # 一般知識モード: ベクトル検索を使わずにLLMで問題生成
                    questions = (
                        await llm_service.generate_questions_from_general_knowledge(
                            problem_type=problem_type, count=count
                        )
                    )
                else:
                    # 資料ベースモード: ベクトル検索で関連チャンクを取得
                    similar_chunks = await vector_search_service.search_similar_chunks(
                        db=db, query_text=problem_type, doc_ids=doc_ids, limit=20
                    )

                    # チャンクのテキストを抽出
                    chunk_texts = [chunk.content for chunk, _ in similar_chunks]

                    # フォールバック: 類似チャンクが少ない場合は全チャンクから取得
                    if len(chunk_texts) < 5:
                        all_chunks = (
                            vector_search_service.get_chunks_from_selected_docs(
                                db=db, doc_ids=doc_ids, limit=20
                            )
                        )
                        chunk_texts.extend([chunk.content for chunk in all_chunks])

                    # LLMで問題生成
                    questions = await llm_service.generate_questions(
                        problem_type=problem_type,
                        count=count,
                        context_chunks=chunk_texts,
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

            # 問題作成完了メッセージは送信しない（直接ゲーム開始メッセージへ）

            # ゲーム状態をWebSocketで配信
            await GameService.broadcast_game_status(game_id)

            # 自動的にゲームを開始
            await asyncio.sleep(1)  # 1秒待機してからゲーム開始
            await GameService.start_game(db, game_id)

            logging.info(
                f"Generated and stored {len(all_questions)} questions for game {game_id}"
            )
            return True

        except Exception as e:
            logging.error(f"Question generation failed for game {game_id}: {e}")

            # エラーメッセージを送信
            try:
                await GameService.send_ai_message(
                    db,
                    game_id,
                    "❌ **問題作成に失敗しました**\n\n申し訳ございません。もう一度お試しください。",
                )
            except Exception as msg_error:
                logging.error(f"Failed to send error message: {msg_error}")

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
        db: Session, game_id: str, content: str, message_type: str = "game_question"
    ) -> bool:
        """AIメッセージをチャットに送信"""
        try:
            # ゲーム情報からroom_idを取得
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                logging.error(f"Game {game_id} not found for AI message")
                return False

            room_id = game_data["room_id"]
            logging.info(f"Sending AI message to room {room_id} for game {game_id}")

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
                    "user_name": "Ludus",
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
                        "user_name": "Ludus",
                        "created_at": created_at,
                        "message_type": message_type,
                    },
                },
            )

            logging.info(f"AI message sent successfully: {message_id}")
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

            # ゲーム開始メッセージを送信
            await GameService.send_ai_message(
                db,
                game_id,
                "🚀 **ゲーム開始！**\n\n頑張って答えてください！最初に正解した人が得点を獲得します。",
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

            # スコア情報を取得
            scores = {}
            try:
                score_data = redis_client.hgetall(f"game:{game_id}:scores")
                for user_id, score_json in score_data.items():
                    user_score = json.loads(score_json)
                    scores[user_id] = user_score["total_score"]
            except Exception as e:
                logging.warning(f"Failed to get scores for game {game_id}: {e}")

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
                        "scores": scores,
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
            current_question_index = int(game_data.get("current_question_index", 0))

            # 現在の問題のタイマーIDを設定
            timer_id = f"timer_{game_id}_{current_question_index}"
            redis_client.set(f"game:{game_id}:current_timer", timer_id, ex=30)

            # 20秒のタイマーを開始
            for remaining in range(20, 0, -1):
                # 最初に現在の残り時間を配信
                await manager.broadcast(
                    room_id, {"type": "game_timer", "timeRemaining": remaining}
                )

                await asyncio.sleep(1)

                # タイマーが有効かチェック（正解が出て別のタイマーが開始された場合は停止）
                current_timer = redis_client.get(f"game:{game_id}:current_timer")
                if current_timer != timer_id:
                    logging.info(
                        f"Timer {timer_id} cancelled (current: {current_timer})"
                    )
                    return False

                # ゲーム状態をチェック（ゲームが終了していたら停止）
                current_game = GameService.get_game_info(game_id)
                if not current_game or current_game["status"] != "playing":
                    break

                # 問題インデックスが変わっていたら停止（正解が出て次の問題に進んだ場合）
                if (
                    int(current_game.get("current_question_index", 0))
                    != current_question_index
                ):
                    logging.info(f"Question changed, stopping timer {timer_id}")
                    return False

                # 10秒でヒント送信
                if remaining == 11:
                    await GameService.send_hint(db, game_id)

            # 時間切れの場合、正解を表示してから次の問題へ（タイマーがまだ有効な場合のみ）
            current_timer = redis_client.get(f"game:{game_id}:current_timer")
            if current_timer == timer_id:
                current_game = GameService.get_game_info(game_id)
                if current_game and current_game["status"] == "playing":
                    await GameService.handle_timeout(
                        db, game_id, current_question_index
                    )

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

{current_question['question']}"""

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, game_id, question_content, "game_question"
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

            # ヒントメッセージを作成
            hint_content = f"💡 **ヒント**: {current_question['hint']}"

            # AIメッセージとして送信
            await GameService.send_ai_message(db, game_id, hint_content, "game_hint")

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

            if is_correct:
                result_content = (
                    f"🎉 **正解！** {user_name}さんが {points}点 獲得しました！"
                )
            else:
                result_content = f"❌ {user_name}さんの回答は不正解でした"

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, game_id, result_content, "game_result"
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

            question_num = int(game_data["current_question_index"]) + 1
            total_questions = int(game_data["total_questions"])

            # 問題メッセージを作成
            question_content = f"""🎯 **問題 {question_num}/{total_questions}**

{current_question['question']}"""

            # AIメッセージとして送信
            await GameService.send_ai_message(
                db, game_id, question_content, "game_question"
            )

            return True
        except Exception as e:
            logging.error(f"Failed to send next question for game {game_id}: {e}")
            return False

    @staticmethod
    async def submit_answer(
        db: Session,
        game_id: str,
        user_id: str,
        answer: str,
        user_name: str = "",
        message_id: str = "",
    ) -> Optional[Dict]:
        """回答を提出して採点"""
        try:
            # ゲーム状態をチェック - playing状態でない場合は回答を受け付けない
            game_data = GameService.get_game_info(game_id)
            if not game_data or game_data.get("status") != "playing":
                logging.info(
                    f"Game {game_id} is not accepting answers (status: {game_data.get('status') if game_data else 'not found'})"
                )
                return None

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
            GameService._update_user_score(
                game_id, user_id, grading_result["score"], question_index
            )

            # スコア更新後にゲーム状態をブロードキャスト
            await GameService.broadcast_game_status(game_id)

            # 採点結果をWebSocketで送信（チャットメッセージとしては送信しない）
            game_data = GameService.get_game_info(game_id)
            if game_data:
                # メッセージIDが提供されている場合のみ採点結果を送信
                if message_id:
                    await manager.broadcast(
                        game_data["room_id"],
                        {
                            "type": "game_grading_result",
                            "user_id": user_id,
                            "message_id": message_id,
                            "result": {
                                "is_correct": grading_result["is_correct"],
                                "score": grading_result["score"],
                                "feedback": grading_result["feedback"],
                                "user_name": user_name or user_id,
                            },
                        },
                    )
                else:
                    logging.warning(
                        "No message_id provided for grading result, skipping WebSocket broadcast"
                    )

            # 正解の場合、回答受付を停止して解説を表示し、5秒後に次の問題に進む
            if grading_result["is_correct"]:
                logging.info(
                    f"Correct answer from {user_name or user_id}, stopping answer acceptance and showing explanation"
                )
                # ゲーム状態を「次の問題待ち」に変更して回答受付を停止
                redis_client.hset(f"game:{game_id}", "status", "waiting_next")
                await GameService.broadcast_game_status(game_id)

                asyncio.create_task(
                    GameService.handle_correct_answer(
                        db, game_id, question_index, user_name or user_id
                    )
                )

            logging.info(
                f"Answer submitted for game {game_id}, user {user_id}: {grading_result['score']} points"
            )
            return grading_result

        except Exception as e:
            logging.error(f"Failed to submit answer for game {game_id}: {e}")
            return None

    @staticmethod
    def _update_user_score(
        game_id: str, user_id: str, points: int, question_index: int
    ):
        """ユーザーのスコアを更新（同じ問題では最高得点を記録）"""
        try:
            current_score_json = redis_client.hget(f"game:{game_id}:scores", user_id)
            if current_score_json:
                current_score = json.loads(current_score_json)
                # 古いデータ形式の場合、question_scoresフィールドを追加
                if "question_scores" not in current_score:
                    current_score["question_scores"] = {}
            else:
                current_score = {
                    "total_score": 0,
                    "correct_answers": 0,
                    "rank": 0,
                    "question_scores": {},
                }

            # 同じ問題での最高得点を記録
            question_key = str(question_index)
            if question_key not in current_score["question_scores"]:
                current_score["question_scores"][question_key] = points
                current_score["total_score"] += points
                if points > 70:  # 部分正解以上
                    current_score["correct_answers"] += 1
            else:
                # 既存の得点より高い場合のみ更新
                old_points = current_score["question_scores"][question_key]
                if points > old_points:
                    current_score["question_scores"][question_key] = points
                    current_score["total_score"] += points - old_points
                    # 正解数の調整
                    if old_points <= 70 and points > 70:
                        current_score["correct_answers"] += 1
                    elif old_points > 70 and points <= 70:
                        current_score["correct_answers"] -= 1

            redis_client.hset(
                f"game:{game_id}:scores", user_id, json.dumps(current_score)
            )
        except Exception as e:
            logging.error(
                f"Failed to update score for user {user_id} in game {game_id}: {e}"
            )

    @staticmethod
    async def handle_timeout(db: Session, game_id: str, question_index: int):
        """時間切れの処理：正解表示→3秒待機→次の問題"""
        try:
            # 現在のタイマーを無効化
            invalidate_timer_id = f"timeout_{game_id}_{question_index}"
            redis_client.set(
                f"game:{game_id}:current_timer", invalidate_timer_id, ex=30
            )
            logging.info(f"Timeout for question {question_index}")

            # 現在の問題を取得
            questions_json = redis_client.get(f"game:{game_id}:questions")
            if not questions_json:
                logging.error(f"Questions not found for game {game_id}")
                return

            questions = json.loads(questions_json)
            if question_index >= len(questions):
                logging.error(
                    f"Question index {question_index} out of range for game {game_id}"
                )
                return

            question_data = questions[question_index]

            # 時間切れメッセージを作成
            timeout_content = f"""⏰ **時間切れ！** ⏰

**正解**: {question_data.get('reference_answer', '不明')}

**解説**:
{question_data.get('explanation', '解説がありません')}

次の問題まで3秒お待ちください..."""

            # 時間切れメッセージをAIメッセージとして送信
            await GameService.send_ai_message(db, game_id, timeout_content)

            # 3秒待機
            await asyncio.sleep(3)

            # 次の問題に進む
            await GameService.next_question(db, game_id)

        except Exception as e:
            logging.error(f"Failed to handle timeout for game {game_id}: {e}")
            # エラーが発生した場合でも次の問題に進む
            await GameService.next_question(db, game_id)

    @staticmethod
    async def handle_correct_answer(
        db: Session, game_id: str, question_index: int, correct_user_name: str
    ):
        """正解者が出た時の処理：解説表示→5秒待機→次の問題"""
        try:
            # 現在のタイマーを無効化（新しいタイマーIDを設定して古いタイマーを停止）
            invalidate_timer_id = f"invalidated_{game_id}_{question_index}"
            redis_client.set(
                f"game:{game_id}:current_timer", invalidate_timer_id, ex=30
            )
            logging.info(f"Invalidated timer for question {question_index}")

            # 現在の問題を取得
            questions_json = redis_client.get(f"game:{game_id}:questions")
            if not questions_json:
                logging.error(f"Questions not found for game {game_id}")
                return

            questions = json.loads(questions_json)
            if question_index >= len(questions):
                logging.error(
                    f"Question index {question_index} out of range for game {game_id}"
                )
                return

            question_data = questions[question_index]

            # 解説メッセージを作成
            explanation_content = f"""🎉 **正解！** 🎉

**正解者**: {correct_user_name}
**答え**: {question_data.get('reference_answer', '不明')}

**解説**:
{question_data.get('explanation', '解説がありません')}

次の問題まで5秒お待ちください..."""

            # 解説をAIメッセージとして送信
            await GameService.send_ai_message(db, game_id, explanation_content)

            # 5秒待機
            await asyncio.sleep(5)

            # 次の問題に進む
            await GameService.next_question(db, game_id)

        except Exception as e:
            logging.error(f"Failed to handle correct answer for game {game_id}: {e}")
            # エラーが発生した場合でも次の問題に進む
            await GameService.next_question(db, game_id)

    @staticmethod
    def get_game_ranking(game_id: str, db: Session = None) -> List[Dict]:
        """ゲームのランキング情報を取得"""
        try:
            # スコア情報を取得
            scores_data = redis_client.hgetall(f"game:{game_id}:scores")
            if not scores_data:
                return []

            # ユーザー情報を取得（ルーム参加者から）
            game_data = GameService.get_game_info(game_id)
            if not game_data:
                return []

            room_id = game_data["room_id"]

            # ルーム参加者情報を取得
            user_name_map = {}
            if db:
                try:
                    room_members = room_service.get_room_members(db, room_id)
                    user_name_map = {user.id: user.name for user in room_members}
                except Exception as e:
                    logging.error(f"Failed to get room members for {room_id}: {e}")

            ranking = []
            for user_id, score_json in scores_data.items():
                try:
                    score_data = json.loads(score_json)
                    total_score = score_data.get("total_score", 0)
                    correct_answers = score_data.get("correct_answers", 0)

                    # ユーザー名を取得（ルーム参加者情報から、なければフォールバック）
                    user_name = user_name_map.get(user_id, f"ユーザー{user_id[-4:]}")

                    ranking.append(
                        {
                            "user_id": user_id,
                            "user_name": user_name,
                            "total_score": total_score,
                            "correct_answers": correct_answers,
                        }
                    )
                except (json.JSONDecodeError, KeyError) as e:
                    logging.error(f"Failed to parse score data for user {user_id}: {e}")
                    continue

            # スコア順でソート（降順）
            ranking.sort(key=lambda x: x["total_score"], reverse=True)

            # 順位を追加
            for i, user_data in enumerate(ranking):
                user_data["rank"] = i + 1

            return ranking
        except Exception as e:
            logging.error(f"Failed to get game ranking for {game_id}: {e}")
            return []

    @staticmethod
    def format_ranking_message(ranking: List[Dict]) -> str:
        """ランキング情報をメッセージ形式にフォーマット"""
        if not ranking:
            return "ランキング情報がありません。"

        message_lines = ["🏆 **最終ランキング**\n"]

        for user_data in ranking:
            rank = user_data["rank"]
            user_name = user_data["user_name"]
            total_score = user_data["total_score"]
            correct_answers = user_data["correct_answers"]

            # 順位に応じた絵文字
            if rank == 1:
                rank_emoji = "🥇"
            elif rank == 2:
                rank_emoji = "🥈"
            elif rank == 3:
                rank_emoji = "🥉"
            else:
                rank_emoji = f"{rank}位"

            message_lines.append(
                f"{rank_emoji} **{user_name}**: {total_score}点 ({correct_answers}問正解)"
            )

        return "\n".join(message_lines)

    @staticmethod
    async def next_question(db: Session, game_id: str) -> bool:
        """次の問題に進む"""
        try:
            # 重複実行防止のためのロック
            lock_key = f"game:{game_id}:next_question_lock"
            if redis_client.exists(lock_key):
                logging.info(f"Next question already in progress for game {game_id}")
                return False

            # 2秒間のロック（処理時間を考慮）
            redis_client.set(lock_key, "1", ex=2)

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

                # ランキング情報を取得してメッセージを送信
                ranking = GameService.get_game_ranking(game_id, db)
                ranking_message = GameService.format_ranking_message(ranking)

                # ゲーム終了メッセージを送信
                end_message = f"""🎊 **ゲーム終了！**

お疲れ様でした！

{ranking_message}

新しいゲームを始めたい場合は「新しいゲーム」ボタンを押してください。"""

                await GameService.send_ai_message(db, game_id, end_message)

                # ゲーム終了イベントを配信
                await GameService.broadcast_game_status(game_id)

                # ランキング情報をWebSocketで配信
                game_data = GameService.get_game_info(game_id)
                if game_data:
                    room_id = game_data["room_id"]
                    await manager.broadcast(
                        room_id, {"type": "game_ranking", "ranking": ranking}
                    )

                # ロック解除
                redis_client.delete(lock_key)
                return False
            else:
                # 次の問題へ
                redis_client.hset(
                    f"game:{game_id}",
                    mapping={
                        "current_question_index": str(current_index + 1),
                        "status": "playing",  # 新しい問題開始時に回答受付を再開
                    },
                )

                # 次の問題を送信
                await GameService.send_next_question(db, game_id)

                # ゲーム状態を配信
                await GameService.broadcast_game_status(game_id)

                # 新しい問題のタイマーを開始
                asyncio.create_task(GameService.start_question_timer(db, game_id))

                # ロック解除
                redis_client.delete(lock_key)
                return True

        except Exception as e:
            logging.error(f"Failed to advance to next question in game {game_id}: {e}")
            # エラー時もロック解除
            redis_client.delete(f"game:{game_id}:next_question_lock")
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
