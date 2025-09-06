"""
LLMサービス - Gemini + LangChainを使用した問題生成と採点
"""

import logging
import os
from typing import Dict, List

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

# 環境変数からAPIキーを取得
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY not found in environment variables")

# Geminiモデルを初期化
llm = (
    ChatGoogleGenerativeAI(
        model="gemini-1.5-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0.7,
        max_tokens=2048,
    )
    if GEMINI_API_KEY
    else None
)


class QuizQuestion(BaseModel):
    """クイズ問題の構造"""

    question: str = Field(description="問題文")
    reference_answer: str = Field(description="正解例")
    hint: str = Field(description="ヒント")
    context: str = Field(description="問題の背景情報")
    source_chunk: str = Field(description="参照元のチャンク")


class QuizQuestions(BaseModel):
    """複数のクイズ問題"""

    questions: List[QuizQuestion] = Field(description="生成された問題のリスト")


class GradingResult(BaseModel):
    """採点結果"""

    score: int = Field(description="得点（0-100）")
    is_correct: bool = Field(description="正解かどうか")
    feedback: str = Field(description="フィードバックメッセージ")
    reasoning: str = Field(description="採点理由")


class LLMService:
    """LLMサービスクラス"""

    def __init__(self):
        self.llm = llm
        if not self.llm:
            logging.error("LLM not initialized - check GEMINI_API_KEY")

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
        if not self.llm:
            raise Exception("LLM not available - check GEMINI_API_KEY")

        # チャンク数を制限
        selected_chunks = context_chunks[:max_chunks]
        context_text = "\n\n".join(
            [f"[チャンク{i+1}]\n{chunk}" for i, chunk in enumerate(selected_chunks)]
        )

        # プロンプトテンプレートを作成
        prompt = ChatPromptTemplate.from_template(
            """
あなたは教育的なクイズ問題を作成する専門家です。

以下の資料から「{problem_type}」を{count}問作成してください。

制約:
- 各問題は重複しない内容にする
- 難易度は中級レベル
- 回答は簡潔に（1-3語程度が望ましい）
- ヒントも含める
- 問題の背景情報も含める

資料:
{context_text}

以下のJSON形式で出力してください:
{{
  "questions": [
    {{
      "question": "問題文",
      "reference_answer": "正解例",
      "hint": "ヒント",
      "context": "問題の背景情報",
      "source_chunk": "参照元のチャンク（最初の50文字程度）"
    }}
  ]
}}
        """
        )

        # JSON出力パーサーを設定
        parser = JsonOutputParser(pydantic_object=QuizQuestions)

        # チェーンを作成
        chain = prompt | self.llm | parser

        try:
            # 問題生成を実行
            result = await chain.ainvoke(
                {
                    "problem_type": problem_type,
                    "count": count,
                    "context_text": context_text,
                }
            )

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
        if not self.llm:
            raise Exception("LLM not available - check GEMINI_API_KEY")

        # プロンプトテンプレートを作成
        prompt = ChatPromptTemplate.from_template(
            """
あなたは公平で正確なクイズ採点者です。

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

以下のJSON形式で出力してください:
{{
  "score": 100,
  "is_correct": true,
  "feedback": "正解です！詳細な説明...",
  "reasoning": "採点理由の説明"
}}
        """
        )

        # JSON出力パーサーを設定
        parser = JsonOutputParser(pydantic_object=GradingResult)

        # チェーンを作成
        chain = prompt | self.llm | parser

        try:
            # 採点を実行
            result = await chain.ainvoke(
                {
                    "question": question,
                    "reference_answer": reference_answer,
                    "user_answer": user_answer,
                    "context": context,
                }
            )

            logging.info(
                f"Graded answer: {user_answer} -> {result.get('score', 0)} points"
            )
            return result

        except Exception as e:
            logging.error(f"Answer grading failed: {e}")
            # フォールバック: 簡単な採点
            return self._grade_answer_fallback(reference_answer, user_answer)

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
            "feedback": "正解です！" if is_correct else "不正解です。",
            "reasoning": "簡易採点による結果",
        }


# グローバルインスタンス
llm_service = LLMService()
