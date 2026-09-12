import type {
  ManualReadingDraft,
  ReadingAttempt,
  ReadingItem,
} from "../types";
import type { SubmittedAttempt } from "../lib/api";

export const readingItem: ReadingItem = {
  id: "reading-1",
  status: "review",
  title: "읽기 연습",
  language: "ko",
  officialLevel: "TOPIK 4급",
  perceivedLevel: "TOPIK 4급",
  perceivedVotes: 0,
  itemAccuracy: null,
  lengthType: "short",
  topic: "생활",
  recommendedSeconds: 90,
  contentSource: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: null,
  myLatestStatus: null,
  myFirstSubmissionTimedOut: false,
  myScore: null,
  myScoreReason: null,
  isBookmarked: false,
  passage: "지문입니다.",
  question: "첫 번째 문제입니다.",
  choices: [
    { id: "choice-1", text: "선택지 1", isCorrect: true },
    { id: "choice-2", text: "선택지 2", isCorrect: false },
  ],
  explanation: "해설입니다.",
  questions: [
    {
      id: "question-1",
      question: "첫 번째 문제입니다.",
      choices: [
        { id: "choice-1", text: "선택지 1", isCorrect: true },
        { id: "choice-2", text: "선택지 2", isCorrect: false },
      ],
      explanation: "첫 번째 해설입니다.",
    },
    {
      id: "question-2",
      question: "두 번째 문제입니다.",
      choices: [
        { id: "choice-3", text: "선택지 3", isCorrect: false },
        { id: "choice-4", text: "선택지 4", isCorrect: true },
      ],
      explanation: "두 번째 해설입니다.",
    },
  ],
  quality: 0,
  reportCount: 0,
  reports: [],
  validations: [],
};

export const readingAttempt: ReadingAttempt = {
  attemptId: "attempt-1",
  itemId: readingItem.id,
  startedAt: 1_700_000_000_000,
  elapsedSeconds: 42,
  selectedChoiceId: "choice-1",
  choices: readingItem.choices,
  submitted: false,
  message: "",
  questions: readingItem.questions,
  answers: [
    { questionId: "question-1", selectedChoiceId: "choice-1" },
    { questionId: "question-2", selectedChoiceId: "choice-4" },
  ],
};

export const submittedAttempt: SubmittedAttempt = {
  attemptId: readingAttempt.attemptId,
  itemId: readingItem.id,
  isCorrect: true,
  selectedChoiceId: "choice-1",
  correctChoiceId: "choice-1",
  explanation: "제출 해설입니다.",
  selectedChoiceWrongExplanation: null,
  elapsedSeconds: 42,
  recommendedSeconds: 90,
  itemAccuracy: 80,
  challengerCount: 10,
  questionResults: [
    {
      questionId: "question-1",
      isCorrect: true,
      selectedChoiceId: "choice-1",
      correctChoiceId: "choice-1",
      explanation: "첫 번째 해설입니다.",
      selectedChoiceWrongExplanation: null,
    },
  ],
};

export const manualReadingDraft: ManualReadingDraft = {
  title: readingItem.title,
  language: readingItem.language,
  officialLevel: readingItem.officialLevel,
  lengthType: readingItem.lengthType,
  topic: readingItem.topic,
  recommendedSeconds: readingItem.recommendedSeconds,
  passage: readingItem.passage,
  question: readingItem.question,
  choices: readingItem.choices,
  explanation: readingItem.explanation,
  questions: readingItem.questions,
};
