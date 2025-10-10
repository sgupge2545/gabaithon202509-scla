"""
LLMサービス - Ollama + requestsを使用した問題生成と採点
"""

import json
import logging
import re
from typing import Dict, List

from .ollama_service import ollama_service

logger = logging.getLogger(__name__)


class LLMService:
    """LLMサービスクラス"""

    def __init__(self):
        self.ollama = ollama_service
        if not self.ollama:
            logging.error("Ollama service not available")

    async def generate_questions(
        self,
        problem_type: str,
        count: int,
        context_chunks: List[str],
        max_chunks: int = 10,
    ) -> List[Dict]:
        """
        指定されたタイプの問題を生成

        Args:
            problem_type: 問題のタイプ（例: "ネットワークに関する穴埋め問題"）
            count: 生成する問題数
            context_chunks: 参考にするチャンクのリスト
            max_chunks: 使用する最大チャンク数

        Returns:
            生成された問題のリスト
        """
        if not self.ollama:
            raise Exception("Ollama service not available")

        # チャンク数を制限
        selected_chunks = context_chunks[:max_chunks]
        context_text = "\n\n".join(
            [f"[チャンク{i+1}]\n{chunk}" for i, chunk in enumerate(selected_chunks)]
        )

        # プロンプトを構築
        prompt = f"""あなたは教育的なクイズ問題を作成する専門家です。

以下の資料から「{problem_type}」を{count}問作成してください。

制約:
- 各問題は重複しない内容にする
- 難易度は中級レベル
- 回答は簡潔に（1-3語程度が望ましい）
- ヒントも含める
- 問題の背景情報も含める
- 正解の解説も含める（なぜその答えが正しいのかを説明）

資料:
{context_text}

以下のJSON形式で出力してください:
{{
  "questions": [
    {{
      "question": "問題文",
      "reference_answer": "正解例",
      "hint": "ヒント",
      "explanation": "正解の解説（なぜその答えが正しいのかを説明）",
      "context": "問題の背景情報",
      "source_chunk": "参照元のチャンク（最初の50文字程度）"
    }}
  ]
}}"""

        try:
            # Ollamaを使用して問題生成を実行
            response_text = await self.ollama.generate_response(prompt)

            if not response_text:
                raise Exception("Ollama returned empty response")

            # JSONレスポンスをパース
            result = self._parse_json_response(response_text)

            if not result or "questions" not in result:
                raise Exception("Invalid JSON response format")

            logging.info(
                f"Generated {len(result.get('questions', []))} questions for type: {problem_type}"
            )
            return result.get("questions", [])

        except Exception as e:
            logging.error(f"Question generation failed: {e}")
            # フォールバック: 簡単な問題を生成
            return self._generate_fallback_questions(
                problem_type, count, selected_chunks
            )

    async def generate_questions_from_general_knowledge(
        self,
        problem_type: str,
        count: int,
    ) -> List[Dict]:
        """
        一般知識から問題を生成

        Args:
            problem_type: 問題のタイプ（例: "日本の歴史に関する問題"）
            count: 生成する問題数

        Returns:
            生成された問題のリスト
        """
        if not self.ollama:
            raise Exception("Ollama service not available")

        # プロンプトを構築
        prompt = f"""あなたは教育的なクイズ問題を作成する専門家です。

「{problem_type}」について、一般的な知識から{count}問作成してください。

制約:
- 各問題は重複しない内容にする
- 難易度は中級レベル
- 回答は簡潔に（1-3語程度が望ましい）
- ヒントも含める
- 問題の背景情報も含める
- 正解の解説も含める（なぜその答えが正しいのかを説明）
- 一般的によく知られた内容から出題する

以下のJSON形式で出力してください:
{{
  "questions": [
    {{
      "question": "問題文",
      "reference_answer": "正解例",
      "hint": "ヒント",
      "explanation": "正解の解説（なぜその答えが正しいのかを説明）",
      "context": "問題の背景情報",
      "source_chunk": "一般知識"
    }}
  ]
}}"""

        try:
            # Ollamaを使用して問題生成を実行
            response_text = await self.ollama.generate_response(prompt)

            if not response_text:
                raise Exception("Ollama returned empty response")

            # JSONレスポンスをパース
            result = self._parse_json_response(response_text)

            if not result or "questions" not in result:
                raise Exception("Invalid JSON response format")

            questions = result.get("questions", [])

            # 問題にインデックスを追加
            for i, question in enumerate(questions):
                question["question_index"] = i

            logging.info(
                f"Generated {len(questions)} questions for type: {problem_type} (general knowledge)"
            )
            return questions

        except Exception as e:
            logging.error(f"General knowledge question generation failed: {e}")
            return []

    async def grade_answer(
        self, question: str, reference_answer: str, user_answer: str, context: str = ""
    ) -> Dict:
        """
        ユーザーの回答を採点

        Args:
            question: 問題文
            reference_answer: 正解例
            user_answer: ユーザーの回答
            context: 問題の背景情報

        Returns:
            採点結果
        """
        if not self.ollama:
            raise Exception("Ollama service not available")

        # プロンプトを構築
        prompt = f"""あなたは公平で正確なクイズ採点者です。

問題: {question}
正解例: {reference_answer}
背景情報: {context}
ユーザー回答: {user_answer}

以下の基準で採点してください:

【採点基準】
- 完全正解: 100点 (意味が完全に一致)
- 部分正解: 70点 (主要な要素は正しいが一部不完全)
- 惜しい: 30点 (方向性は正しいが不正確)
- 不正解: 0点 (全く違う/無回答)

【考慮事項】
- 表記揺れ (ひらがな/カタカナ/英語/漢字)
- 略語と正式名称の違い
- 語順の違い
- 助詞の有無
- 大文字小文字の違い

【重要な制約】
- フィードバックには絶対に正解や答えを含めないでください
- 正解がわかるような具体的なヒントも避けてください
- 採点結果と励ましのコメントのみを提供してください

以下のJSON形式で出力してください:
{{
  "score": 100,
  "is_correct": true,
  "feedback": "正解です！よくできました。",
  "reasoning": "採点理由の説明"
}}"""

        try:
            # Ollamaを使用して採点を実行
            response_text = await self.ollama.generate_response(prompt)

            if not response_text:
                raise Exception("Ollama returned empty response")

            # JSONレスポンスをパース
            result = self._parse_json_response(response_text)

            if not result:
                raise Exception("Invalid JSON response format")

            logging.info(
                f"Graded answer: {user_answer} -> {result.get('score', 0)} points"
            )
            return result

        except Exception as e:
            logging.error(f"Answer grading failed: {e}")
            # フォールバック: 簡単な採点
            return self._grade_answer_fallback(reference_answer, user_answer)

    def _parse_json_response(self, response_text: str) -> Dict:
        """
        OllamaからのJSONレスポンスをパース

        Args:
            response_text: Ollamaからの生のレスポンステキスト

        Returns:
            パースされたJSONオブジェクト
        """
        try:
            # JSONブロックを抽出（```json ... ``` の形式も対応）
            json_match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
            if json_match:
                json_text = json_match.group(1)
            else:
                # JSONブロックがない場合は、{ から } までを抽出
                start_idx = response_text.find("{")
                end_idx = response_text.rfind("}")
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    json_text = response_text[start_idx : end_idx + 1]
                else:
                    json_text = response_text

            # JSONをパース
            return json.loads(json_text)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.debug(f"Raw response: {response_text[:500]}...")
            return {}
        except Exception as e:
            logger.error(f"Error parsing response: {e}")
            return {}

    def _generate_fallback_questions(
        self, problem_type: str, count: int, chunks: List[str]
    ) -> List[Dict]:
        """フォールバック用の簡単な問題生成"""
        questions = []
        for i in range(min(count, len(chunks))):
            chunk = chunks[i]
            questions.append(
                {
                    "question": f"{problem_type}に関する問題 {i+1}",
                    "reference_answer": "サンプル回答",
                    "hint": "資料を参考にしてください",
                    "context": chunk[:100] + "...",
                    "source_chunk": chunk[:50] + "...",
                }
            )
        return questions

    def _grade_answer_fallback(self, reference_answer: str, user_answer: str) -> Dict:
        """フォールバック用の簡単な採点"""
        # 簡単な文字列比較
        is_correct = reference_answer.lower().strip() == user_answer.lower().strip()
        score = 100 if is_correct else 0

        return {
            "score": score,
            "is_correct": is_correct,
            "feedback": "正解です！よくできました。"
            if is_correct
            else "残念！次回頑張りましょう。",
            "reasoning": "簡易採点による結果",
        }


# グローバルインスタンス
llm_service = LLMService()
