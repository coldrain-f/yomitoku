import type { Dispatch, ReactNode, SetStateAction } from "react";
import type {
  difficultyLevels,
  readingLanguages,
  lengthTypes,
  readingTopics,
  recommendedTopic,
} from "./lib/readingPolicy";

export type DifficultyLevel = (typeof difficultyLevels)[number];
export type ReadingLanguage = (typeof readingLanguages)[number];
export type LengthType = (typeof lengthTypes)[number];
export type ReadingStatus = "review" | "held" | "published";
export type AttemptStatus = "unstarted" | "wrong" | "correct";
export type Role = "admin" | "learner";
export type Topic = (typeof readingTopics)[number];

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
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  perceivedLevel: DifficultyLevel;
  perceivedVotes: number;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  myLatestStatus?: Exclude<AttemptStatus, "unstarted"> | null;
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
  attemptId: string;
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
  correctChoiceId: string;
  isCorrect: boolean;
  elapsedSeconds: number;
  explanation: string;
  selectedChoiceWrongExplanation: string | null;
  itemAccuracy: number | null;
  challengerCount: number;
}

export interface ListFilters {
  language: ReadingLanguage;
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
  language: ReadingLanguage;
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
  language: ReadingLanguage;
  level: DifficultyLevel;
  length: LengthType;
  topic: Topic | typeof recommendedTopic;
  generatorModel: string;
  validatorModel: string;
}

export interface ManualReadingDraft {
  title: string;
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  passage: string;
  question: string;
  choices: Choice[];
  explanation: string;
}

export interface FeedbackValues {
  quality: "" | "1" | "2" | "3" | "4" | "5";
  level: "" | DifficultyLevel;
  comment: string;
}

export interface DialogConfig {
  type?: "list-filter" | "admin-filter" | "report" | "feedback" | "google-login";
  kicker: string;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

export type Screen =
  | "home"
  | "stats"
  | "reading"
  | "result"
  | "admin"
  | "generation-history"
  | "admin-edit"
  | "manual-create"
  | "generate"
  | "preview";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type ChildContent = ReactNode;
