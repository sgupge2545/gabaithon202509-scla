FROM python:3.11-slim

WORKDIR /app

# システムパッケージを先にインストール（キャッシュ効率化）
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    nano \
    procps \
    sqlite3 \
    libsqlite3-dev \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Pythonの依存関係を先にインストール（変更頻度が低いため）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Node.jsの依存関係をインストール（package.jsonとpackage-lock.jsonのみコピー）
COPY client/package*.json ./client/
RUN cd client && npm ci --only=production=false

# 開発用の追加設定（必要に応じて）
RUN cd client && npm cache clean --force

# アプリケーションコードをコピー（最後に行うことで上記のキャッシュが有効活用される）
COPY . .

EXPOSE 8000 3000

# 両方のサーバーを同時起動
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload & cd client && npm run dev & wait"] 
