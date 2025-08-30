#!/bin/bash

# バックグラウンドでFastAPIを起動
echo "Starting FastAPI server..."
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload &

# クライアントディレクトリに移動してNext.jsを起動
echo "Starting Next.js server..."
cd client
pnpm dev &

# 両方のプロセスを待機
wait
