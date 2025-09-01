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

# Node.jsの依存関係を先にインストール（キャッシュ効率化）
COPY client/package*.json ./client/
WORKDIR /app/client
# package-lock.json がある場合は npm ci を使うとより再現性が高くキャッシュに向いている
RUN npm ci --prefer-offline --no-audit --no-fund
WORKDIR /app

# アプリケーションコードをコピー（最後に行うことで上記のキャッシュが有効活用される）
COPY . .

EXPOSE 8000 3000

# エントリーポイントスクリプトをコピーして実行可能にする
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# エントリーポイントスクリプトを使用して両方のサーバーを起動
CMD ["./entrypoint.sh"] 
