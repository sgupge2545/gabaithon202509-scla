"use client";

import { useState } from "react";
import {
  FaUpload,
  FaTimes,
  FaSpinner,
  FaCheck,
  FaExclamationTriangle,
} from "react-icons/fa";
import { Button } from "./ui/button";

interface UploadResult {
  filename: string;
  success: boolean;
  doc_id?: string;
  chunks_count?: number;
  error?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (results: UploadResult[]) => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  onUploadComplete,
}: UploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setUploadResults([]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(files);
    setUploadResults([]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResults([]);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const response = await fetch(`${base}/api/docs/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`アップロードに失敗しました: ${response.status}`);
      }

      const data = await response.json();
      setUploadResults(data.results || []);

      // 成功したファイルがある場合は親コンポーネントに通知
      const successfulUploads = data.results.filter(
        (r: UploadResult) => r.success
      );
      if (successfulUploads.length > 0) {
        onUploadComplete(successfulUploads);
      }
    } catch (error) {
      console.error("アップロードエラー:", error);
      // エラーの場合は全ファイルを失敗として扱う
      const errorResults = selectedFiles.map((file) => ({
        filename: file.name,
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      }));
      setUploadResults(errorResults);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setSelectedFiles([]);
      setUploadResults([]);
      onClose();
    }
  };

  const allUploadsComplete = uploadResults.length > 0 && !uploading;
  const hasSuccessfulUploads = uploadResults.some((r) => r.success);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            資料をアップロード
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={uploading}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <FaTimes />
          </Button>
        </div>

        {!allUploadsComplete && (
          <>
            {/* ファイル選択エリア */}
            <div
              className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors mb-4 ${
                dragActive
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-2">
                <FaUpload className="h-8 w-8 text-slate-500" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  クリックまたはドラッグ＆ドロップでファイルを追加
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    document.getElementById("upload-files")?.click()
                  }
                  disabled={uploading}
                >
                  ファイルを選択
                </Button>
                <span className="text-xs text-slate-500">PDF / 画像 など</span>
              </div>
              <input
                id="upload-files"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </div>

            {/* 選択されたファイル一覧 */}
            {selectedFiles.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  選択されたファイル ({selectedFiles.length}件)
                </h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                        {file.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        className="text-slate-500 hover:text-red-500"
                      >
                        <FaTimes className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* アップロードボタン */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={uploading}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || uploading}
                className="min-w-[120px]"
              >
                {uploading ? (
                  <>
                    <FaSpinner className="animate-spin mr-2" />
                    アップロード中...
                  </>
                ) : (
                  <>
                    <FaUpload className="mr-2" />
                    アップロード
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* アップロード結果 */}
        {allUploadsComplete && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              アップロード結果
            </h3>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadResults.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    result.success
                      ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {result.success ? (
                    <FaCheck className="text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <FaExclamationTriangle className="text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {result.filename}
                    </p>
                    {result.success ? (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {result.chunks_count}個のチャンクに分割されました
                      </p>
                    ) : (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {result.error}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose}>
                {hasSuccessfulUploads ? "完了" : "閉じる"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
