import type { Dispatch, ReactNode, SetStateAction } from "react";

export type DifficultyLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type LengthType = "short" | "medium" | "long";
export type ReadingStatus = "review" | "held" | "published";
export type AttemptStatus = "unstarted" | "wrong" | "correct";
export type Role = "admin" | "learner";
export type Topic =
  | "생활"
  | "사회"
  | "경제"
  | "과학"
  | "기술"
  | "문화"
  | "여행"
  | "요리"
  | "게임"
  | "교육"
  | "환경";

export interface Choice {
  id: string;
  text: string;
  isCorrect?: boolean;
  wrongExplanation?: string;
}

export interface ValidationResult {
  status: "passed" | "warning";
  answer: string;
  distractor: string;
  explanation: string;
}

export interface ReadingItem {
  id: string;
  status: ReadingStatus;
  title: string;
  officialLevel: DifficultyLevel;
  perceivedLevel: DifficultyLevel;
  perceivedVotes: number;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  passage: string;
  question: string;
  choices: Choice[];
  explanation: string;
  quality: number;
  reportCount: number;
  latestReport: string;
  validation: ValidationResult;
}

export interface AttemptRecord {
  itemId: string;
  status: Exclude<AttemptStatus, "unstarted">;
  isCorrect: boolean;
  elapsedSeconds: number;
  submittedAt: string;
  lengthType: LengthType;
  officialLevel: DifficultyLevel;
}

export interface ReadingAttempt {
  itemId: string;
  startedAt: number;
  elapsedSeconds: number;
  selectedChoiceId: string | null;
  choices: Choice[];
  submitted: boolean;
  message: string;
}

export interface ReadingResult {
  itemId: string;
  item: ReadingItem;
  choices: Choice[];
  selectedChoiceId: string;
  isCorrect: boolean;
  elapsedSeconds: number;
}

export interface ListFilters {
  level: DifficultyLevel | "all";
  length: LengthType | "all";
  status: AttemptStatus | "all";
  sort:
    | "published-desc"
    | "published-asc"
    | "level-asc"
    | "level-desc"
    | "perceived-asc"
    | "perceived-desc";
}

export interface AdminFilters {
  level: DifficultyLevel | "all";
  length: LengthType | "all";
  topic: Topic | "all";
  status: ReadingStatus | "all";
  sort:
    | "updated-desc"
    | "updated-asc"
    | "created-desc"
    | "created-asc"
    | "title-asc"
    | "level-asc"
    | "level-desc"
    | "perceived-asc"
    | "perceived-desc"
    | "status-asc";
}

export interface GenerationValues {
  level: DifficultyLevel;
  length: LengthType;
  topic: Topic | "추천";
}

export interface FeedbackValues {
  quality: "" | "1" | "2" | "3" | "4" | "5";
  level: "" | DifficultyLevel;
  comment: string;
}

export interface DialogConfig {
  type?: "list-filter" | "admin-filter" | "report" | "feedback";
  kicker: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export type Screen =
  | "home"
  | "stats"
  | "reading"
  | "result"
  | "admin"
  | "admin-edit"
  | "generate"
  | "preview";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type ChildContent = ReactNode;
