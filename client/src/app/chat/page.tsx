"use client";

import DocumentModal from "@/components/DocumentModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import UploadModal from "@/components/UploadModal";
import { useAuth } from "@/contexts/AuthContext";
import { useRoom } from "@/contexts/RoomContext";
import { useGameApi } from "@/hooks/useGameApi";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import type { GameEvent, GradingResult } from "@/types/game";
import type { Message } from "@/types/message";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaPaperPlane,
  FaPlay,
  FaPlus,
  FaTrash,
  FaUpload,
  FaUsers,
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [askLudus, setAskLudus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 採点結果管理（メッセージIDをキーとして使用）
  const [gradingResults, setGradingResults] = useState<
    Record<string, GradingResult | { loading: boolean }>
  >({});

  const { user } = useAuth();
  const { leaveRoom, currentRoom, initialized, setCurrentRoom } = useRoom();

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
      // 採点結果を保存
      setGradingResults((prev) => ({
        ...prev,
        [data.message_id as string]: data.result as GradingResult,
      }));
    }
  };

  // WebSocket + initial load handled by hook
  const { messages: socketMessages, sendMessage: sendMessageHook } =
    useRoomSocket(currentRoom?.id || "", (data) => {
      // ルーム更新イベントの処理
      const roomEvent = data as { type: string; room?: { id: string } };
      if (
        roomEvent.type === "room_updated" &&
        roomEvent.room?.id === currentRoom?.id
      ) {
        console.log("ルーム更新イベント受信:", roomEvent.room);
        // 現在のルーム情報を更新
        if (currentRoom?.id) {
          setCurrentRoom(currentRoom.id);
        }
        return;
      }

      // ゲーム状態更新時にcurrentGameIdも設定
      if (data.type === "game_status_update" && data.gameStatus?.game_id) {
        if (currentGameId !== data.gameStatus.game_id) {
          console.log("ゲームID設定:", data.gameStatus.game_id);
          setCurrentGameId(data.gameStatus.game_id);
        }

        // 問題が終了した時（waiting_next or finished）に採点中の表示をクリア
        if (
          data.gameStatus.status === "waiting_next" ||
          data.gameStatus.status === "finished"
        ) {
          setGradingResults((prev) => {
            const updated = { ...prev };
            // loading: true の項目を削除
            Object.keys(updated).forEach((messageId) => {
              const result = updated[messageId];
              if (result && "loading" in result && result.loading) {
                delete updated[messageId];
              }
            });
            return updated;
          });
        }
      }
      updateGameStateFromWebSocket(data, handleGradingResult);
    });

  useEffect(() => {
    setMessages(socketMessages);

    // メッセージが更新された時に採点結果を復元
    if (socketMessages.length > 0 && user?.id) {
      const newGradingResults: Record<
        string,
        GradingResult | { loading: boolean }
      > = {};

      socketMessages.forEach((message) => {
        // 採点結果があるメッセージ（自分・他人問わず）
        if (message.grading_result) {
          newGradingResults[message.id] = message.grading_result;
        }
      });

      // 既存の採点結果と統合（既存のloading状態は保持）
      setGradingResults((prev) => {
        const updated = { ...prev };
        Object.entries(newGradingResults).forEach(([messageId, result]) => {
          // 既にloading状態でない場合のみ更新
          if (!updated[messageId] || !("loading" in updated[messageId])) {
            updated[messageId] = result;
          }
        });
        return updated;
      });
    }
  }, [socketMessages, user?.id]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sendingMessage || !currentRoom?.id) return;

    setSendingMessage(true);

    // ゲーム中の場合、このメッセージを採点対象として記録
    const isGameMessage =
      gameState.gameStatus?.status === "playing" && currentGameId && user?.id;

    try {
      // Ludusフラグが有効な場合はメッセージに@ludusを付加
      const messageToSend = askLudus ? `@ludus ${newMessage}` : newMessage;
      const sentMessage = await sendMessageHook(messageToSend);

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
      // Ludusに聞くモードをリセット
      setAskLudus(false);
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
  const [documentSource, setDocumentSource] = useState<"existing" | "none">(
    "existing"
  );
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{
    docId: string;
    filename: string;
  } | null>(null);
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
    fetchUserDocuments();
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

  const handleUploadComplete = (
    results: { doc_id?: string; success: boolean }[]
  ) => {
    // アップロード完了後、資料一覧を再取得
    fetchUserDocuments();
    setUploadModalOpen(false);

    // 成功したアップロードを自動選択
    const successfulDocIds = results
      .map((r) => r.doc_id)
      .filter(Boolean) as string[];
    setSelectedDocIds((prev) => [...new Set([...prev, ...successfulDocIds])]);
  };

  const clearDocumentSelection = () => {
    setSelectedDocIds([]);
  };

  const extractReferencedDocuments = (message: Message) => {
    // メッセージに参考資料の情報が含まれている場合はそれを使用
    if (message.referenced_docs && message.referenced_docs.length > 0) {
      return message.referenced_docs.map((doc) => ({
        docId: doc.doc_id,
        filename: doc.filename,
      }));
    }

    // 後方互換性のため、コンテンツからも抽出を試行
    const referenceMatch = message.content.match(/参考：(.+)$/m);
    if (!referenceMatch) return [];

    // ファイル名を抽出（カンマ区切り）
    const filenames = referenceMatch[1].split(",").map((name) => name.trim());

    // ファイル名からdoc_idを検索（userDocumentsが利用可能な場合のみ）
    const referencedDocs = [];
    for (const filename of filenames) {
      const doc = userDocuments.find((d) => d.filename === filename);
      if (doc) {
        referencedDocs.push({ docId: doc.id, filename: doc.filename });
      }
    }

    return referencedDocs;
  };

  const handleViewDocument = (docId: string, filename: string) => {
    setSelectedDocument({ docId, filename });
    setDocumentModalOpen(true);
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
      <div className="text-white rounded-none border-b border-t-0 border-l-0 border-r-0 bg-gradient-to-br from-[#0f0f23] to-[#533483]">
        <div className="p-4">
          {/* 基本情報行 */}
          <div className="flex items-center space-x-4 mb-3">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <FaArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{currentRoom.title}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <Badge
                  variant="outline"
                  className="flex items-center space-x-1 text-white"
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
                {gameState.gameStatus.status === "ready" && !startingGame && (
                  <Button
                    onClick={startChatGame}
                    size="sm"
                    className="ml-auto bg-gradient-to-br from-[#9a15f8] to-[#f86510]"
                  >
                    <FaPlay className="h-4 w-4 mr-2" />
                    ゲーム開始
                  </Button>
                )}
                {gameState.gameStatus.status === "generating" && (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <Badge
                      variant="outline"
                      className="text-white border-white"
                    >
                      問題生成中...
                    </Badge>
                  </div>
                )}
                {gameState.gameStatus.status === "finished" && (
                  <Button
                    onClick={startGame}
                    size="sm"
                    disabled={startingGame}
                    className="ml-auto bg-gradient-to-br from-[#9a15f8] to-[#f86510]"
                  >
                    {startingGame ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        開始中...
                      </>
                    ) : (
                      <>
                        <FaPlay className="h-4 w-4 mr-2" />
                        ゲーム開始
                      </>
                    )}
                  </Button>
                )}
                {(gameState.gameStatus.status === "ready" ||
                  gameState.gameStatus.status === "generating") &&
                  startingGame && (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <Badge
                        variant="outline"
                        className="text-white border-white"
                      >
                        ゲーム開始中...
                      </Badge>
                    </div>
                  )}
              </div>
            ) : startingGame ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <Badge variant="outline" className="text-white border-white">
                  ゲーム開始中...
                </Badge>
              </div>
            ) : (
              <Button
                onClick={startGame}
                className="ml-auto bg-gradient-to-br from-[#9a15f8] to-[#f86510]"
                disabled={startingGame}
              >
                <FaPlay className="h-4 w-4 mr-2" />
                ゲーム開始
              </Button>
            )}
          </div>

          {/* ゲーム進行情報行 */}
          {gameState.gameStatus &&
            (gameState.gameStatus.status === "playing" ||
              gameState.gameStatus.status === "waiting_next") && (
              <div className="space-y-3">
                {/* 問題番号とタイマー */}
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-sm">
                    問題 {gameState.gameStatus.current_question_index + 1} /{" "}
                    {gameState.gameStatus.total_questions}
                  </Badge>
                  {gameState.gameStatus.status === "playing" && (
                    <div className="text-sm font-medium">
                      残り {gameState.timeRemaining}秒
                    </div>
                  )}
                  {gameState.gameStatus.status === "waiting_next" && (
                    <Badge variant="outline" className="text-sm">
                      次の問題を準備中...
                    </Badge>
                  )}
                </div>

                {/* プログレスバー */}
                {gameState.gameStatus.status === "playing" && (
                  <div className="w-full">
                    <Progress
                      value={(gameState.timeRemaining / 20) * 100}
                      className="h-3"
                      indicatorClassName={
                        gameState.timeRemaining <= 5
                          ? "bg-red-500"
                          : gameState.timeRemaining <= 10
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }
                    />
                  </div>
                )}

                {/* 点数表示 */}
                {gameState.gameStatus.scores &&
                  Object.keys(gameState.gameStatus.scores).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(gameState.gameStatus.scores)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([userId, score], index) => {
                          // ユーザー名を取得（参加者情報から）
                          const userName =
                            currentRoom.members?.find((m) => m.id === userId)
                              ?.name || `ユーザー${userId.slice(-4)}`;
                          const isCurrentUser = userId === user?.id;

                          return (
                            <Badge
                              key={userId}
                              variant={isCurrentUser ? "default" : "secondary"}
                              className={`text-xs ${
                                index === 0
                                  ? "bg-yellow-500 text-yellow-50"
                                  : ""
                              }`}
                            >
                              {index === 0 && "👑 "}
                              {userName}: {score}点
                            </Badge>
                          );
                        })}
                    </div>
                  )}
              </div>
            )}
        </div>
      </div>

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
                    <span className="text-sm">資料から選択</span>
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
                            📁 資料一覧 ({userDocuments.length}件)
                          </span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setUploadModalOpen(true)}
                              className="text-xs"
                            >
                              <FaUpload className="mr-1" />
                              新規アップロード
                            </Button>
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
                          アップロードした資料がありません
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setUploadModalOpen(true)}
                          className="mt-2"
                        >
                          <FaUpload className="mr-1" />
                          最初の資料をアップロード
                        </Button>
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
                  className="bg-purple-500"
                  type="button"
                  onClick={confirmStartGame}
                  disabled={
                    startingGame ||
                    (documentSource === "existing" &&
                      selectedDocIds.length === 0)
                  }
                >
                  {startingGame ? "開始中..." : "開始"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2 bg-gradient-to-br from-[#533483] to-[#9c74d8] relative">
        <div className="space-y-3">
          {messages.map((message, index) => {
            const prevMessage = messages[index - 1];

            // アイコン表示条件：前のメッセージがない、ユーザーが違う、または発言時刻の分数が違う
            const showAvatar =
              !prevMessage ||
              prevMessage.user?.id !== message.user?.id ||
              Boolean(
                prevMessage.created_at &&
                  message.created_at &&
                  new Date(prevMessage.created_at).getMinutes() !==
                    new Date(message.created_at).getMinutes()
              );

            const showName = showAvatar && !isOwnMessage(message, user);

            // 採点結果を取得（全てのメッセージ対象）
            const gradingResult = gradingResults[message.id];

            return (
              <MessageItem
                key={message.id}
                message={message}
                showAvatar={showAvatar}
                showName={showName}
                gradingResult={gradingResult}
                onViewDocument={handleViewDocument}
                extractReferencedDocuments={extractReferencedDocuments}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-gradient-to-br from-[#0f0f23] to-[#533483] border-t border-slate-200 dark:border-slate-700 relative">
        {/* Ludusに聞くボタン（ゲーム中でない場合のみ表示） */}
        {!gameState.gameStatus || gameState.gameStatus.status === "finished" ? (
          <div className="absolute bottom-full left-4 mb-2 group">
            <div className="relative transform transition-all duration-300 hover:scale-105">
              {/* グロー効果 */}
              <div
                className={`absolute inset-0 rounded-lg blur-sm transition-opacity duration-300 ${
                  askLudus
                    ? "bg-purple-400 opacity-75"
                    : "bg-purple-300 opacity-0 group-hover:opacity-50"
                }`}
              ></div>

              {/* メインボタン */}
              <Button
                variant={askLudus ? "default" : "outline"}
                size="sm"
                onClick={() => setAskLudus(!askLudus)}
                className={`relative transition-all duration-300 shadow-lg backdrop-blur-sm border-2 ${
                  askLudus
                    ? "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-purple-400 shadow-purple-500/50"
                    : "border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-950/50 bg-white/90 dark:bg-slate-800/90 hover:border-purple-400 dark:hover:border-purple-400"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className={`transition-transform duration-200 ${
                      askLudus ? "animate-bounce" : "group-hover:scale-110"
                    }`}
                  >
                    <Image
                      src="/ludus.png"
                      alt="Ludus"
                      width={20}
                      height={20}
                      className="rounded-full object-cover"
                    />
                  </div>
                  <span className="font-medium">
                    {askLudus ? "Ludusに聞く" : "Ludusに聞く"}
                  </span>
                </div>

                {/* キラキラエフェクト */}
                {askLudus && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-ping"></div>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <Textarea
              placeholder={
                gameState.gameStatus?.status === "waiting_next"
                  ? "正解者が出ました！次の問題をお待ちください..."
                  : askLudus
                  ? "Ludusに質問を入力..."
                  : "メッセージを入力..."
              }
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={
                sendingMessage ||
                gameState.gameStatus?.status === "waiting_next"
              }
              className={`min-h-[44px] bg-white max-h-32 resize-none rounded-2xl border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 pr-12 ${
                askLudus
                  ? "border-purple-300 dark:border-purple-600 focus:border-purple-500 dark:focus:border-purple-400"
                  : ""
              }`}
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
            className={`h-11 w-11 rounded-full transition-colors ${
              askLudus
                ? "bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
                : "bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
            }`}
            size="icon"
          >
            <FaPaperPlane className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* アップロードモーダル */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* 資料表示モーダル */}
      {selectedDocument && (
        <DocumentModal
          isOpen={documentModalOpen}
          onClose={() => {
            setDocumentModalOpen(false);
            setSelectedDocument(null);
          }}
          docId={selectedDocument.docId}
          filename={selectedDocument.filename}
        />
      )}
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
  onViewDocument,
  extractReferencedDocuments,
}: {
  message: Message;
  showAvatar?: boolean;
  showName?: boolean;
  gradingResult?: GradingResult | { loading: boolean };
  onViewDocument?: (docId: string, filename: string) => void;
  extractReferencedDocuments?: (
    message: Message
  ) => { docId: string; filename: string }[];
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
              {message.user.name === "Ludus" ||
              message.user.id === "ai_system" ||
              message.user.id === "system" ? (
                <AvatarImage src="/ludus.png" />
              ) : message.user.picture ? (
                <AvatarImage src={message.user.picture} />
              ) : null}
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
            <div className="text-xs text-white mb-1 ml-3">
              {message.user.name || "不明"}
            </div>
          )}

          <div
            className={`relative px-4 py-2 rounded-2xl max-w-md break-words ${
              isOwnMessageFunc
                ? "bg-purple-500 text-white rounded-br-md"
                : "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-bl-md"
            }`}
          >
            <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-slate dark:prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside mb-2">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside mb-2">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-slate-200 dark:bg-slate-600 px-1 py-0.5 rounded text-xs">
                        {children}
                      </code>
                    ) : (
                      <code className="block bg-slate-100 dark:bg-slate-800 p-2 rounded text-xs overflow-x-auto">
                        {children}
                      </code>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-slate-300 dark:border-slate-600 pl-4 italic mb-2">
                      {children}
                    </blockquote>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                  em: ({ children }) => <em className="italic">{children}</em>,
                  h1: ({ children }) => (
                    <h1 className="text-lg font-bold mb-2">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-bold mb-2">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-bold mb-1">{children}</h3>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
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
                  ? "right-0 translate-x-1 border-l-8 border-l-purple-500 border-t-4 border-t-transparent border-b-4 border-b-transparent"
                  : "left-0 -translate-x-1 border-r-8 border-r-white dark:border-r-slate-700 border-t-4 border-t-transparent border-b-4 border-b-transparent"
              }`}
            />
          </div>

          {/* 参考資料ボタン */}
          {extractReferencedDocuments &&
            onViewDocument &&
            (() => {
              const referencedDocs = extractReferencedDocuments(message);
              return referencedDocs.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {referencedDocs.map((doc, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDocument(doc.docId, doc.filename)}
                      className="text-xs h-6 px-2 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900 dark:border-blue-800 dark:text-blue-300"
                    >
                      📄 {doc.filename}
                    </Button>
                  ))}
                </div>
              ) : null;
            })()}
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
                  {!isOwnMessageFunc && gradingResult.user_name && (
                    <span className="ml-2 text-xs font-normal opacity-75">
                      - {gradingResult.user_name}の回答
                    </span>
                  )}
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
