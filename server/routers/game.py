import logging
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..services.gcv_ocr import extract_text

router = APIRouter()


@router.post("/start")
async def start_game(files: List[UploadFile] = File(default=[])) -> Dict[str, Any]:
    """
    ゲーム開始用の簡易API。
    - クライアントからアップロードされたファイルを受け取り
    - OCRを実行して抽出テキストをサーバーログに出力
    - 結果の概要を返す
    """
    if files is None:
        files = []

    results: List[Dict[str, Any]] = []
    for f in files:
        try:
            content = await f.read()
            mime_type = f.content_type or "application/octet-stream"
            texts = extract_text(content, mime_type=mime_type)

            # ログおよびprintでとりあえず出力
            logging.info(
                "[OCR] file=%s mime=%s pages=%d", f.filename, mime_type, len(texts)
            )
            print("===== OCR RESULT: ", f.filename, "=====")
            for i, t in enumerate(texts, start=1):
                print(f"--- page/image {i} ---")
                # 出力量が多くなりすぎないように先頭だけを表示
                print(t[:1000])

            results.append(
                {
                    "filename": f.filename,
                    "mime_type": mime_type,
                    "pages": len(texts),
                }
            )
        except Exception as e:  # noqa: BLE001
            logging.exception("OCR failed for %s", f.filename)
            raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    return {"ok": True, "files": results}
