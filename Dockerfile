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

# npmは既にNode.jsに含まれているため、追加インストール不要

# Pythonの依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# フロントエンドの依存関係をインストール
COPY client/package.json ./client/
RUN cd client && npm install

# アプリケーションファイルをコピー
COPY . .

EXPOSE 8000 3000

# 両方のサーバーを同時起動
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload & cd client && npm run dev & wait"] 
