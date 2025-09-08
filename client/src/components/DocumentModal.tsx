"use client";

import { useState } from "react";
import { FaTimes, FaDownload } from "react-icons/fa";
import { Button } from "./ui/button";

interface DocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  filename: string;
}

export default function DocumentModal({
  isOpen,
  onClose,
  docId,
  filename,
}: DocumentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);

  if (!isOpen) return null;

  const fileUrl = `/api/docs/file/${docId}`;
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(
    filename.toLowerCase()
  );

  const handleDownload = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(fileUrl, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`ファイルの取得に失敗しました: ${response.status}`);
      }

      // ファイルをダウンロード
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("ダウンロードエラー:", err);
      setError(
        err instanceof Error ? err.message : "ダウンロードに失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-4xl h-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-600">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {filename}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-slate-600 border-t-transparent mr-1"></div>
                  DL中...
                </>
              ) : (
                <>
                  <FaDownload className="mr-1 h-3 w-3" />
                  DL
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <FaTimes />
            </Button>
          </div>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 p-4 overflow-hidden">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {isPdf ? (
            <div className="w-full h-full relative">
              {!isPdfLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      PDFを読み込み中...
                    </p>
                  </div>
                </div>
              )}
              <object
                data={fileUrl}
                type="application/pdf"
                className="w-full h-full rounded-lg"
                onLoad={() => setIsPdfLoaded(true)}
              >
                <iframe
                  src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="w-full h-full border-0 rounded-lg"
                  title={filename}
                  onLoad={() => setIsPdfLoaded(true)}
                  onError={() => {
                    setError("PDFの読み込みに失敗しました");
                    setIsPdfLoaded(true);
                  }}
                />
              </object>
            </div>
          ) : isImage ? (
            <div className="w-full h-full bg-slate-50 dark:bg-slate-700 rounded-lg overflow-auto relative">
              <div className="absolute inset-0 p-4 overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl}
                  alt={filename}
                  className="w-full h-auto rounded-lg block"
                  onError={() => {
                    setError("画像の読み込みに失敗しました");
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="text-center">
                <div className="text-4xl mb-4">📄</div>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  このファイル形式はプレビューできません
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleDownload} disabled={loading}>
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        ダウンロード中...
                      </>
                    ) : (
                      <>
                        <FaDownload className="mr-2 h-4 w-4" />
                        ダウンロード
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
