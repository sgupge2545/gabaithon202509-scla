export interface GameStatus {
  game_id: string;
  status: "generating" | "ready" | "playing" | "finished";
  current_question_index: number;
  total_questions: number;
  time_remaining?: number;
  participants: string[];
  scores: Record<string, number>;
}

export interface Question {
  id: string;
  question: string;
  hint?: string;
}

export interface GameState {
  gameStatus: GameStatus | null;
  currentQuestion: Question | null;
  timeRemaining: number;
  showHint: boolean;
  error: string | null;
}

export interface ProblemConfig {
  content: string;
  count: number;
}

export interface StartQuizRequest {
  room_id: string;
  document_source: string;
  selected_doc_ids: string[];
  problems: ProblemConfig[];
}

export interface AnswerRequest {
  answer: string;
}

export interface GameEvent {
  type: "game_status_update" | "game_question" | "game_hint" | "game_timer";
  gameStatus?: GameStatus;
  question?: Question;
  timeRemaining?: number;
}

export interface AnswerResult {
  is_correct: boolean;
  score: number;
  feedback: string;
}
