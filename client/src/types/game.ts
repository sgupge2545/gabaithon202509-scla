export interface GameStatus {
  game_id: string;
  status: "generating" | "ready" | "playing" | "waiting_next" | "finished";
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

export interface RankingUser {
  user_id: string;
  user_name: string;
  total_score: number;
  correct_answers: number;
  rank: number;
}

export interface GameEvent {
  type:
    | "game_status_update"
    | "game_question"
    | "game_hint"
    | "game_timer"
    | "game_grading_result"
    | "game_grading_result_restore"
    | "game_ranking";
  gameStatus?: GameStatus;
  question?: Question;
  timeRemaining?: number;
  user_id?: string;
  message_id?: string;
  result?: GradingResult;
  ranking?: RankingUser[];
}

export interface GradingResult {
  is_correct: boolean;
  score: number;
  feedback: string;
  user_name: string;
  user_id?: string;
}

export interface AnswerResult {
  is_correct: boolean;
  score: number;
  feedback: string;
}
