"""
Ollama LLMサービス - requestsを使用したローカルLLM接続
"""

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class OllamaService:
    """Ollama LLMサービスクラス"""

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL")
        self.model = model or os.getenv("OLLAMA_MODEL")
        self.timeout = 30

        # 接続テスト
        if not self._test_connection():
            logger.warning(f"Ollama server at {self.base_url} is not responding")

    def _test_connection(self) -> bool:
        """Ollamaサーバーへの接続をテスト"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to connect to Ollama server: {e}")
            return False

    async def generate_response(self, prompt: str) -> Optional[str]:
        """
        プロンプトからAI応答を生成

        Args:
            prompt: 入力プロンプト

        Returns:
            生成された応答テキスト
        """
        try:
            # Ollama Generate APIを使用
            url = f"{self.base_url}/api/generate"
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,  # ストリーミングを無効化
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 1024,  # 最大生成トークン数
                },
            }

            logger.info(f"Sending request to Ollama: {self.model}")

            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code == 200:
                result = response.json()
                generated_text = result.get("response", "")

                if generated_text:
                    logger.info(
                        f"Successfully generated response ({len(generated_text)} chars)"
                    )
                    return generated_text.strip()
                else:
                    logger.warning("Ollama returned empty response")
                    return None
            else:
                logger.error(
                    f"Ollama API error: {response.status_code} - {response.text}"
                )
                return None

        except requests.exceptions.Timeout:
            logger.error("Ollama request timed out")
            return None
        except requests.exceptions.ConnectionError:
            logger.error("Failed to connect to Ollama server")
            return None
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            return None

    def get_available_models(self) -> list:
        """利用可能なモデル一覧を取得"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = [model["name"] for model in data.get("models", [])]
                return models
            else:
                logger.error(f"Failed to get models: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Failed to get available models: {e}")
            return []

    def is_model_available(self, model_name: str) -> bool:
        """指定したモデルが利用可能かチェック"""
        available_models = self.get_available_models()
        return model_name in available_models

    def set_model(self, model_name: str) -> bool:
        """使用するモデルを変更"""
        if self.is_model_available(model_name):
            self.model = model_name
            logger.info(f"Model changed to: {model_name}")
            return True
        else:
            logger.warning(f"Model {model_name} is not available")
            return False


# グローバルインスタンス
ollama_service = OllamaService()
