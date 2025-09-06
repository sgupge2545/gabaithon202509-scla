"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaPaperPlane,
  FaArrowLeft,
  FaUsers,
  FaPlay,
  FaPlus,
  FaTrash,
  FaUpload,
  FaTimes,
} from "react-icons/fa";
import type { Message } from "@/types/message";
import { useAuth } from "@/contexts/AuthContext";
import { useRoom } from "@/contexts/RoomContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { useGameApi } from "@/hooks/useGameApi";
import type { GradingResult, GameEvent } from "@/types/game";

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [exiting, setExiting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 採点結果管理（メッセージIDをキーとして使用）
  const [gradingResults, setGradingResults] = useState<
    Record<string, GradingResult | { loading: boolean }>
  >({});

  const { user } = useAuth();
  const { leaveRoom, currentRoom, initialized } = useRoom();

  // 初期ロードは RoomContext の復元完了を待つ

  // ゲーム状態管理（useRoomSocketより前に定義）
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const {
    gameState,
    startGame: startChatGame,
    startQuizGame,
    updateGameStateFromWebSocket,
  } = useGameApi(currentGameId);

  // 採点結果を処理するコールバック
  const handleGradingResult = (data: GameEvent) => {
    if (data.message_id && data.result) {
      // 実際のメッセージIDをキーとして採点結果を保存
      setGradingResults((prev) => ({
        ...prev,
        [data.message_id as string]: data.result as GradingResult,
      }));
    }
  };

  // WebSocket + initial load handled by hook
  const { messages: socketMessages, sendMessage: sendMessageHook } =
    useRoomSocket(currentRoom?.id || "", (data) =>
      updateGameStateFromWebSocket(data, handleGradingResult)
    );

  useEffect(() => {
    setMessages(socketMessages);
  }, [socketMessages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sendingMessage || !currentRoom?.id) return;

    setSendingMessage(true);

    // ゲーム中の場合、このメッセージを採点対象として記録
    const isGameMessage =
      gameState.gameStatus?.status === "playing" && currentGameId && user?.id;

    try {
      const sentMessage = await sendMessageHook(newMessage);

      // ゲーム中のメッセージの場合、採点待ちローディング状態を設定
      if (isGameMessage && sentMessage?.id) {
        setGradingResults((prev) => ({
          ...prev,
          [sentMessage.id]: { loading: true },
        }));
        // 採点中スピナー表示後に自動スクロール
        setTimeout(() => scrollToBottom(), 100);
      }

      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 採点結果が更新された時も自動スクロール
  useEffect(() => {
    scrollToBottom();
  }, [gradingResults]);

  const [gameDialogOpen, setGameDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<
    { content: string; count: number }[]
  >([{ content: "", count: 10 }]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [startingGame, setStartingGame] = useState(false);

  // 資料選択方式の状態管理
  const [documentSource, setDocumentSource] = useState<
    "new" | "existing" | "none"
  >("existing");
  const [userDocuments, setUserDocuments] = useState<
    {
      id: string;
      filename: string;
      mime_type: string;
      created_at: string;
      chunk_count: number;
      preview: string;
    }[]
  >([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  // 資料選択方式が変更されたときに既存資料を取得
  useEffect(() => {
    if (documentSource === "existing" && gameDialogOpen) {
      fetchUserDocuments();
    }
  }, [documentSource, gameDialogOpen]);

  const startGame = () => {
    // 前のゲーム状態をリセット
    setCurrentGameId(null);
    setGradingResults({});

    setGameDialogOpen(true);
    // ダイアログを開いたときに既存資料を取得
    if (documentSource === "existing") {
      fetchUserDocuments();
    }
  };

  const fetchUserDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const res = await fetch(`${base}/api/docs/my-documents`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch documents: ${res.status}`);
      }

      const data = (await res.json()) as {
        documents: {
          id: string;
          filename: string;
          mime_type: string;
          created_at: string;
          chunk_count: number;
          preview: string;
        }[];
      };
      setUserDocuments(data.documents || []);
    } catch (err) {
      console.error("ドキュメント取得エラー:", err);
      setUserDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocIds(userDocuments.map((doc) => doc.id));
  };

  const clearDocumentSelection = () => {
    setSelectedDocIds([]);
  };

  const mergeFiles = (existing: File[], incoming: File[]) => {
    const map = new Map<string, File>();
    for (const f of existing) {
      map.set(`${f.name}:${f.size}:${f.lastModified}`, f);
    }
    for (const f of incoming) {
      map.set(`${f.name}:${f.size}:${f.lastModified}`, f);
    }
    return Array.from(map.values());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setSelectedFiles((prev) => mergeFiles(prev, files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;
    setSelectedFiles((prev) => mergeFiles(prev, files));
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addProblemRow = () => {
    setProblems((prev) => [...prev, { content: "", count: 10 }]);
  };

  const removeProblemRow = (index: number) => {
    setProblems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateProblemContent = (index: number, value: string) => {
    setProblems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content: value };
      return next;
    });
  };

  const updateProblemCount = (index: number, value: number) => {
    const safe = Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value));
    setProblems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], count: safe };
      return next;
    });
  };

  const confirmStartGame = async () => {
    try {
      setStartingGame(true);
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";

      if (documentSource === "existing") {
        // 既存資料を使用する場合
        const requestData = {
          room_id: currentRoom?.id || "",
          document_source: "existing",
          selected_doc_ids: selectedDocIds,
          problems: problems,
        };

        const result = await startQuizGame(requestData);

        if (result.error) {
          throw new Error(`Game start failed: ${result.error}`);
        }

        console.log("クイズゲーム開始API 応答:", result.data);

        // ゲーム開始後、ゲーム進行画面に切り替え
        if (result.data?.game_id) {
          setCurrentGameId(result.data.game_id);
        }
      } else if (documentSource === "none") {
        // 一般知識モード
        const requestData = {
          room_id: currentRoom?.id || "",
          document_source: "none",
          selected_doc_ids: [],
          problems: problems,
        };

        const result = await startQuizGame(requestData);

        if (result.error) {
          throw new Error(`Game start failed: ${result.error}`);
        }

        console.log("一般知識クイズゲーム開始API 応答:", result.data);

        // ゲーム開始後、ゲーム進行画面に切り替え
        if (result.data?.game_id) {
          setCurrentGameId(result.data.game_id);
        }
      } else {
        // 新規ファイルアップロードの場合（既存の処理）
        const form = new FormData();
        for (const file of selectedFiles) {
          form.append("files", file, file.name);
        }
        // 設定情報も送信
        form.append(
          "config",
          JSON.stringify({
            document_source: "new",
            problems: problems,
          })
        );

        const res = await fetch(`${base}/api/game/start`, {
          method: "POST",
          body: form,
          headers: { Accept: "application/json" },
          credentials: "include",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Game start failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        console.log("ゲーム開始API 応答:", data);

        // ゲーム開始後、ゲーム進行画面に切り替え
        if (data.game_id) {
          setCurrentGameId(data.game_id);
        }
      }

      setGameDialogOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setStartingGame(false);
    }
  };

  const handleBack = async () => {
    setExiting(true);
    const targetRoomId = currentRoom?.id;
    router.push("/rooms");
    if (targetRoomId) {
      try {
        await leaveRoom(targetRoomId);
      } catch {}
    }
  };

  if (!initialized || exiting) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="flex justify-center items-center h-screen flex-col">
        <h2 className="text-xl font-semibold text-destructive mb-4">
          {"ルームが見つかりません"}
        </h2>
        <Button onClick={handleBack}>ルーム一覧に戻る</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Card className="rounded-none border-b border-t-0 border-l-0 border-r-0">
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <FaArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{currentRoom.title}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <Badge
                  variant="outline"
                  className="flex items-center space-x-1"
                >
                  <FaUsers className="h-3 w-3" />
                  <span>
                    {currentRoom.members?.length || 0}/
                    {currentRoom.capacity || 0}
                  </span>
                </Badge>
                {currentRoom.visibility === "passcode" && (
                  <Badge variant="secondary">パスコード</Badge>
                )}
              </div>
            </div>
            {gameState.gameStatus ? (
              <div className="ml-auto flex items-center space-x-4">
                {gameState.gameStatus.status === "playing" && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      問題 {gameState.gameStatus.current_question_index + 1}/
                      {gameState.gameStatus.total_questions}
                    </Badge>
                    <Badge
                      variant={
                        gameState.timeRemaining > 10 ? "default" : "destructive"
                      }
                    >
                      残り {gameState.timeRemaining}秒
                    </Badge>
                  </div>
                )}
                {gameState.gameStatus.status === "waiting_next" && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      問題 {gameState.gameStatus.current_question_index + 1}/
                      {gameState.gameStatus.total_questions}
                    </Badge>
                    <Badge variant="outline">次の問題を準備中...</Badge>
                  </div>
                )}
                {gameState.gameStatus.status === "ready" && (
                  <Button onClick={startChatGame} size="sm">
                    <FaPlay className="h-4 w-4 mr-2" />
                    ゲーム開始
                  </Button>
                )}
                {gameState.gameStatus.status === "generating" && (
                  <Badge variant="outline">問題生成中...</Badge>
                )}
                {gameState.gameStatus.status === "finished" && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">ゲーム終了</Badge>
                    <Button onClick={startGame} size="sm" variant="outline">
                      <FaPlay className="h-4 w-4 mr-2" />
                      新しいゲーム
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button onClick={startGame} className="ml-auto">
                <FaPlay className="h-4 w-4 mr-2" />
                ゲーム開始
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {gameDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setGameDialogOpen(false)}
          />
          <Card className="relative z-10 w-full max-w-xl">
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">ゲーム設定</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGameDialogOpen(false)}
                >
                  閉じる
                </Button>
              </div>

              <div className="space-y-4">
                <span className="text-sm font-medium">資料を選択</span>

                {/* 資料選択方式のラジオボタン */}
                <div className="flex flex-col space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="existing"
                      checked={documentSource === "existing"}
                      onChange={(e) =>
                        setDocumentSource(e.target.value as "existing")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm">過去の資料から選択</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="new"
                      checked={documentSource === "new"}
                      onChange={(e) =>
                        setDocumentSource(e.target.value as "new")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm">新しい資料をアップロード</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="none"
                      checked={documentSource === "none"}
                      onChange={(e) =>
                        setDocumentSource(e.target.value as "none")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm">
                      資料を使わない（一般知識で出題）
                    </span>
                  </label>
                </div>

                {/* 既存資料選択 */}
                {documentSource === "existing" && (
                  <div className="space-y-3">
                    {loadingDocuments ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="text-sm text-slate-600 mt-2">
                          資料を読み込み中...
                        </p>
                      </div>
                    ) : userDocuments.length > 0 ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600">
                            📁 過去にアップロードした資料 (
                            {userDocuments.length}件)
                          </span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={selectAllDocuments}
                              className="text-xs"
                            >
                              すべて選択
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={clearDocumentSelection}
                              className="text-xs"
                            >
                              選択解除
                            </Button>
                          </div>
                        </div>

                        <div className="max-h-48 overflow-y-auto border rounded-lg">
                          {userDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="p-3 border-b last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedDocIds.includes(doc.id)}
                                  onChange={() =>
                                    toggleDocumentSelection(doc.id)
                                  }
                                  className="mt-1"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">
                                    {doc.filename}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    📅{" "}
                                    {new Date(
                                      doc.created_at
                                    ).toLocaleDateString("ja-JP")}{" "}
                                    | 📊 {doc.chunk_count}チャンク
                                  </div>
                                  {doc.preview && (
                                    <div className="text-xs text-slate-400 mt-1 truncate">
                                      {doc.preview}
                                    </div>
                                  )}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>

                        {selectedDocIds.length > 0 && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                            選択中: {selectedDocIds.length}件 (
                            {userDocuments
                              .filter((doc) => selectedDocIds.includes(doc.id))
                              .reduce((sum, doc) => sum + doc.chunk_count, 0)}
                            チャンク)
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <p className="text-sm">
                          過去にアップロードした資料がありません
                        </p>
                        <p className="text-xs mt-1">
                          新しい資料をアップロードしてください
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 一般知識モードの説明 */}
                {documentSource === "none" && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                        💡
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          一般知識モード
                        </h4>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          資料を使わずに、AIの一般的な知識から問題を生成します。
                          <br />
                          出題設定で指定したテーマに基づいて問題が作成されます。
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 新規ファイルアップロード */}
                {documentSource === "new" && (
                  <>
                    <div
                      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                        dragActive
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FaUpload className="h-6 w-6 text-slate-500" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          クリックまたはドラッグ＆ドロップでファイルを追加
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={triggerFileSelect}
                          >
                            ファイルを選択
                          </Button>
                          <span className="text-xs text-slate-500">
                            PDF / 画像 など
                          </span>
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        id="doc-files"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedFiles.map((file, idx) => (
                          <span
                            key={`${file.name}-${file.size}-${file.lastModified}`}
                            className="inline-flex items-center gap-1 text-xs pl-2 pr-1 py-1 rounded-full bg-slate-200 dark:bg-slate-700"
                          >
                            <span
                              className="truncate max-w-[160px]"
                              title={file.name}
                            >
                              {file.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => removeSelectedFile(idx)}
                              aria-label="ファイルを削除"
                            >
                              <FaTimes className="h-3 w-3" />
                            </Button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">出題設定</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addProblemRow}
                  >
                    <FaPlus className="h-3 w-3 mr-1" /> 行を追加
                  </Button>
                </div>

                <div className="space-y-2">
                  {problems.map((p, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-8">
                        <label htmlFor={`content-${idx}`} className="sr-only">
                          内容
                        </label>
                        <input
                          id={`content-${idx}`}
                          className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                          value={p.content}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateProblemContent(idx, e.target.value)
                          }
                          placeholder="例: ネットワークに関する穴埋め問題"
                        />
                      </div>
                      <div className="col-span-3">
                        <label htmlFor={`count-${idx}`} className="sr-only">
                          個数
                        </label>
                        <input
                          id={`count-${idx}`}
                          type="number"
                          min={0}
                          className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                          value={p.count}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateProblemCount(idx, Number(e.target.value))
                          }
                          placeholder="10"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeProblemRow(idx)}
                          aria-label="行を削除"
                        >
                          <FaTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={confirmStartGame}
                  disabled={
                    startingGame ||
                    (documentSource === "existing" &&
                      selectedDocIds.length === 0) ||
                    (documentSource === "new" && selectedFiles.length === 0)
                  }
                >
                  {startingGame ? "開始中..." : "開始"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="space-y-3">
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];
            const showAvatar =
              !prevMessage || prevMessage.user?.id !== message.user?.id;
            const showName = showAvatar && !isOwnMessage(message, user);

            // 採点結果を取得（実際のメッセージIDをキーとして使用）
            const gradingResult = gradingResults[message.id];

            return (
              <MessageItem
                key={message.id}
                message={message}
                showAvatar={showAvatar}
                showName={showName}
                gradingResult={gradingResult}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <Textarea
              placeholder={
                gameState.gameStatus?.status === "waiting_next"
                  ? "正解者が出ました！次の問題をお待ちください..."
                  : "メッセージを入力..."
              }
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={
                sendingMessage ||
                gameState.gameStatus?.status === "waiting_next"
              }
              className="min-h-[44px] max-h-32 resize-none rounded-2xl border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 pr-12"
              rows={1}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={
              !newMessage.trim() ||
              sendingMessage ||
              gameState.gameStatus?.status === "waiting_next"
            }
            className="h-11 w-11 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            size="icon"
          >
            <FaPaperPlane className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isOwnMessage(message: Message, user: { id?: string } | null) {
  return message.user?.id === user?.id;
}

function MessageItem({
  message,
  showAvatar = true,
  showName = true,
  gradingResult,
}: {
  message: Message;
  showAvatar?: boolean;
  showName?: boolean;
  gradingResult?: GradingResult | { loading: boolean };
}) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const { user } = useAuth();
  const isOwnMessageFunc = isOwnMessage(message, user);

  return (
    <div
      className={`flex flex-col ${
        isOwnMessageFunc ? "justify-end" : "justify-start"
      } mb-1 px-2`}
    >
      <div
        className={`flex flex-row items-start w-full ${
          isOwnMessageFunc ? "justify-end" : "justify-start"
        }`}
      >
        <div
          className={`flex-shrink-0 pt-2 ${
            isOwnMessageFunc ? "order-2 ml-2" : "order-1 mr-2"
          }`}
        >
          {showAvatar && message.user ? (
            <Avatar className="w-8 h-8">
              <AvatarImage src={message.user.picture || "/placeholder.svg"} />
              <AvatarFallback
                className={`text-xs ${
                  isOwnMessageFunc
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                {message.user.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>

        <div
          className={`flex flex-col ${
            isOwnMessageFunc ? "order-1" : "order-2"
          }`}
        >
          {showName && !isOwnMessageFunc && message.user && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 ml-3">
              {message.user.name || "不明"}
            </div>
          )}

          <div
            className={`relative px-4 py-2 rounded-2xl max-w-md break-words ${
              isOwnMessageFunc
                ? "bg-blue-500 text-white rounded-br-md"
                : "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-bl-md"
            }`}
          >
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
            <div
              className={`text-xs mt-1 ${
                isOwnMessageFunc
                  ? "text-blue-100"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {formatTime(message.created_at)}
            </div>
            <div
              className={`absolute top-4 w-0 h-0 ${
                isOwnMessageFunc
                  ? "right-0 translate-x-1 border-l-8 border-l-blue-500 border-t-4 border-t-transparent border-b-4 border-b-transparent"
                  : "left-0 -translate-x-1 border-r-8 border-r-white dark:border-r-slate-700 border-t-4 border-t-transparent border-b-4 border-b-transparent"
              }`}
            />
          </div>
        </div>
      </div>

      {/* 採点結果スペース */}
      {gradingResult && (
        <div
          className={`mt-2 ${
            isOwnMessageFunc ? "justify-end" : "justify-start"
          } flex`}
        >
          <div
            className={`px-3 py-2 rounded-lg text-sm max-w-md ${
              "loading" in gradingResult && gradingResult.loading
                ? "bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600"
                : "is_correct" in gradingResult && gradingResult.is_correct
                ? "bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700"
                : "bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700"
            }`}
          >
            {"loading" in gradingResult && gradingResult.loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                <span className="text-gray-600 dark:text-gray-400">
                  採点中...
                </span>
              </div>
            ) : "is_correct" in gradingResult ? (
              <div>
                <div
                  className={`font-semibold ${
                    gradingResult.is_correct
                      ? "text-green-800 dark:text-green-200"
                      : "text-red-800 dark:text-red-200"
                  }`}
                >
                  {gradingResult.is_correct ? "✅ 正解！" : "❌ 不正解"}
                  <span className="ml-2">({gradingResult.score}点)</span>
                </div>
                {gradingResult.feedback && (
                  <div
                    className={`mt-1 text-xs ${
                      gradingResult.is_correct
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    }`}
                  >
                    {gradingResult.feedback}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
