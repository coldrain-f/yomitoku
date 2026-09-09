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
export type LearningScore = 80 | 90 | 100;
export type ScoreReason =
  | "first_submission_on_time"
  | "first_submission_timed_out"
  | "retry_passed";
export type LearningProgress = {
  status: "unstarted" | "wrong" | "passed";
  score: LearningScore | null;
  reason: ScoreReason | null;
};
export type LearningResultFilter =
  | "all"
  | "unstarted"
  | "wrong"
  | "score-100"
  | "score-90"
  | "score-80";
export type FirstSubmissionTiming = "not-submitted" | "on-time" | "timed-out";
export type FirstSubmissionTimeFilter = "all" | "on-time" | "timed-out";
export type Role = "admin" | "learner";
export type Topic = (typeof readingTopics)[number];

export interface Choice {
  id: string;
  text: string;
  isCorrect?: boolean;
  wrongExplanation?: string;
}

export interface PassageHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

export interface ItemReport {
  id: string;
  content: string;
  status: string;
  createdAt: string;
}

export interface ItemValidation {
  validatorRole: "schema" | "answer" | "quality";
  modelId: string;
  status: "passed" | "warning" | "failed";
  score: number | null;
  issueCodes: string[];
  evidence: string[];
  createdAt: string;
}

export interface ReadingItem {
  id: string;
  status: ReadingStatus;
  title: string;
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  perceivedLevel: DifficultyLevel;
  perceivedVotes: number;
  itemAccuracy: number | null;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  contentSource: "manual" | "ai";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  myLatestStatus?: Exclude<AttemptStatus, "unstarted"> | null;
  myFirstSubmissionTimedOut: boolean;
  myScore: LearningScore | null;
  myScoreReason: ScoreReason | null;
  isBookmarked: boolean;
  passage: string;
  question: string;
  choices: Choice[];
  explanation: string;
  questions: ReadingQuestion[];
  quality: number;
  reportCount: number;
  reports: ItemReport[];
  validations: ItemValidation[];
}

export interface ReadingQuestion {
  id: string;
  question: string;
  choices: Choice[];
  explanation: string;
}

export interface AttemptQuestionAnswer {
  questionId: string;
  selectedChoiceId: string | null;
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  selectedChoiceId: string;
  correctChoiceId: string;
  explanation: string;
  selectedChoiceWrongExplanation: string | null;
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
  questions: ReadingQuestion[];
  answers: AttemptQuestionAnswer[];
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
  questionResults: QuestionResult[];
}

export interface ListFilters {
  language: ReadingLanguage;
  bookmarked: boolean;
  level: DifficultyLevel | "all";
  length: LengthType | "all";
  status: LearningResultFilter;
  firstSubmissionTime: FirstSubmissionTimeFilter;
  sort:
    | "published-desc"
    | "published-asc"
    | "level-asc"
    | "level-desc"
    | "perceived-asc"
    | "perceived-desc"
    | "score-desc"
    | "score-asc";
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
  keywords: string[];
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
  questions: ReadingQuestion[];
}

export interface FeedbackValues {
  quality: "" | "1" | "2" | "3" | "4" | "5";
  level: "" | DifficultyLevel;
  comment: string;
}

export interface DialogConfig {
  type?:
    | "list-filter"
    | "admin-filter"
    | "report"
    | "feedback"
    | "google-login"
    | "translation"
    | "score-guide";
  kicker: string;
  title: string;
  context?: string;
  contextMeta?: string[];
  description: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  onReset?: () => void;
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
