FROM python:3.11-slim

WORKDIR /app

# 開発に必要なツールをインストール
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    nano \
    procps \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# pnpmをインストール
RUN npm install -g pnpm

# Pythonの依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# フロントエンドの依存関係をインストール
COPY client/package.json client/pnpm-lock.yaml ./client/
RUN cd client && pnpm install --frozen-lockfile

# アプリケーションファイルをコピー
COPY . .

EXPOSE 8000 3000

# エントリーポイントスクリプトに実行権限を付与
RUN chmod +x entrypoint.sh

# エントリーポイントを設定
ENTRYPOINT ["./entrypoint.sh"] 