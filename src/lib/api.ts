import type {
  AttemptRecord,
  AttemptQuestionAnswer,
  Choice,
  DifficultyLevel,
  GenerationValues,
  HighlightCollectionPage,
  ItemReport,
  ItemValidation,
  LearningScore,
  LengthType,
  ManualReadingDraft,
  PassageHighlight,
  QuestionResult,
  ReadingItem,
  ReadingQuestion,
  ReadingLanguage,
  ReadingStatus,
  Role,
  ScoreReason,
  Topic,
} from "../types";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:8001/api/v1" : "/api/v1");
const accessTokenStorageKey = "yomitoku.access-token";
let accessToken = window.sessionStorage.getItem(accessTokenStorageKey);

const devHeaders: Record<string, string> = import.meta.env.DEV
  ? {
      "X-Dev-Role": import.meta.env.VITE_DEV_ROLE ?? "admin",
      "X-Dev-User-Id":
        import.meta.env.VITE_DEV_USER_ID ??
        "00000000-0000-0000-0000-000000000001",
    }
  : {};

interface ApiChoice {
  id: string;
  text: string;
  isCorrect?: boolean;
  wrongExplanation?: string | null;
}

interface ApiReadingQuestion {
  id: string;
  question: string;
  explanation?: string;
  choices: ApiChoice[];
}

interface ApiReadingSummary {
  id: string;
  title: string;
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  contentSource?: "manual" | "ai";
  status: ReadingStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  perceivedLevel: DifficultyLevel | null;
  perceivedLevelVisible: boolean;
  perceivedVoteCount: number;
  itemAccuracy: number | null;
  myLatestStatus: "correct" | "wrong" | null;
  myFirstSubmissionTimedOut: boolean;
  myScore: LearningScore | null;
  myScoreReason: ScoreReason | null;
  isBookmarked: boolean;
}

interface ApiReadingDetail extends ApiReadingSummary {
  passage: string;
  question: string;
  explanation?: string;
  choices: ApiChoice[];
  questions?: ApiReadingQuestion[];
  qualityAverage?: number | null;
  reportCount?: number;
  challengerCount?: number;
  reports?: ItemReport[];
  validations?: ItemValidation[];
}

interface ApiPublicReadingDetail {
  id: string;
  title: string;
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  passage: string;
  question: string;
  choices: ApiChoice[];
  questions?: ApiReadingQuestion[];
}

interface ApiPassageHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

interface ApiBookmarkState {
  readingItemId: string;
  isBookmarked: boolean;
}

interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ReadingListRequest {
  q?: string;
  language?: ReadingLanguage;
  level?: DifficultyLevel;
  length?: LengthType;
  status?: "correct" | "wrong" | "unstarted" | "score-100" | "score-90" | "score-80";
  time?: "on-time" | "timed-out";
  bookmarked?: boolean;
  sort?:
    | "published_desc"
    | "published_asc"
    | "level_asc"
    | "level_desc"
    | "perceived_level_asc"
    | "perceived_level_desc"
    | "score_asc"
    | "score_desc";
  page?: number;
  pageSize?: number;
}

export interface AdminReadingListRequest extends Omit<ReadingListRequest, "status" | "sort"> {
  topic?: Topic;
  status?: ReadingStatus;
  sort?:
    | "updated_desc"
    | "updated_asc"
    | "created_desc"
    | "created_asc"
    | "title_asc"
    | "level_asc"
    | "level_desc"
    | "perceived_level_asc"
    | "perceived_level_desc"
    | "status_asc";
}

interface ApiStatisticGroup {
  key: string;
  completedCount: number;
  totalCount: number;
  accuracy: number | null;
  averageElapsedSeconds: number | null;
}

export interface Statistics {
  completedCount: number;
  totalGeneratedCount: number;
  accuracy: number | null;
  averageElapsedSeconds: number | null;
  byLanguage?: ApiStatisticGroup[];
  byLength: ApiStatisticGroup[];
  byLevel: ApiStatisticGroup[];
}

export interface StartedAttempt {
  id: string;
  itemId: string;
  startedAt: string;
  choices: Choice[];
  questions: ReadingQuestion[];
}

export interface SubmittedAttempt {
  attemptId: string;
  itemId: string;
  isCorrect: boolean;
  selectedChoiceId: string;
  correctChoiceId: string;
  explanation: string;
  selectedChoiceWrongExplanation: string | null;
  elapsedSeconds: number;
  recommendedSeconds: number;
  itemAccuracy: number | null;
  challengerCount: number;
  questionResults: QuestionResult[];
}

interface ApiAttemptState {
  id: string;
  itemId: string;
  item: ApiReadingDetail;
  startedAt: string;
  elapsedSeconds: number;
  selectedChoiceId: string | null;
  answers?: AttemptQuestionAnswer[];
  submitted: boolean;
  result: SubmittedAttempt | null;
}

export interface RestoredAttempt {
  id: string;
  itemId: string;
  item: ReadingItem;
  startedAt: string;
  elapsedSeconds: number;
  selectedChoiceId: string | null;
  answers: AttemptQuestionAnswer[];
  submitted: boolean;
  result: SubmittedAttempt | null;
}

export interface TranslationSegment {
  sourceText: string;
  translatedText: string;
}

export interface ReadingTranslation {
  sourceLanguage: ReadingLanguage;
  targetLanguage: ReadingLanguage;
  title: TranslationSegment;
  passage: TranslationSegment;
  question: TranslationSegment;
  questions: TranslationSegment[];
}

export interface GenerationJob {
  id: string;
  status: string;
  currentNode: string;
  generatedItemId: string | null;
  errorDetail: string | null;
  conditions: GenerationJobHistory["conditions"];
}

export interface GenerationModelOptions {
  models: string[];
  defaultGeneratorModel: string;
  defaultValidatorModel: string;
}

export interface GenerationUsageEvent {
  eventIndex: number;
  usageStatus: "pending" | "recorded" | "unknown";
  stage: string;
  modelId: string;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  actualCostUsd: number | null;
  stopReason: string | null;
  createdAt: string;
}

export interface GenerationJobHistory {
  id: string;
  status: string;
  currentNode: string;
  conditions: {
    language: ReadingLanguage;
    officialLevel: DifficultyLevel;
    lengthType: LengthType;
    topic: Topic;
    keywords: string[];
  };
  revisionCount: number;
  generatedItemId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  generatorModel: string;
  answerValidatorModel: string;
  qualityValidatorModel: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  actualCostUsd: number | null;
  usageEvents: GenerationUsageEvent[];
  usageComplete: boolean;
}

export interface GenerationJobHistoryPage {
  items: GenerationJobHistory[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CurrentUser {
  id: string;
  role: Role;
}

interface AuthenticationResponse {
  accessToken: string;
  tokenType: "bearer";
  expiresIn: number;
  user: CurrentUser;
}

function toItem(summary: ApiReadingSummary, detail?: ApiReadingDetail): ReadingItem {
  const choices = detail?.choices.map((choice) => ({
    id: choice.id,
    text: choice.text,
    isCorrect: choice.isCorrect,
    wrongExplanation: choice.wrongExplanation ?? undefined,
  })) ?? [];
  const questions = detail?.questions?.map((question) => ({
    id: question.id,
    question: question.question,
    explanation: question.explanation ?? "",
    choices: question.choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      isCorrect: choice.isCorrect,
      wrongExplanation: choice.wrongExplanation ?? undefined,
    })),
  })) ?? [];
  return {
    id: summary.id,
    status: summary.status,
    title: summary.title,
    language: summary.language,
    officialLevel: summary.officialLevel,
    perceivedLevel: summary.perceivedLevel ?? summary.officialLevel,
    perceivedVotes: summary.perceivedVoteCount,
    itemAccuracy: summary.itemAccuracy,
    lengthType: summary.lengthType,
    topic: summary.topic,
    recommendedSeconds: summary.recommendedSeconds,
    contentSource: summary.contentSource ?? "manual",
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    publishedAt: summary.publishedAt,
    myLatestStatus: summary.myLatestStatus ?? null,
    myFirstSubmissionTimedOut: summary.myFirstSubmissionTimedOut ?? false,
    myScore: summary.myScore ?? null,
    myScoreReason: summary.myScoreReason ?? null,
    isBookmarked: summary.isBookmarked ?? false,
    passage: detail?.passage ?? "",
    question: detail?.question ?? "",
    choices,
    explanation: detail?.explanation ?? "",
    questions,
    quality: detail?.qualityAverage ?? 0,
    reportCount: detail?.reportCount ?? 0,
    reports: detail?.reports?.map((report) => ({ ...report })) ?? [],
    validations: detail?.validations?.map((validation) => ({ ...validation })) ?? [],
  };
}

function queryString(values: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validationErrorMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) {
    if (!isRecord(detail)) return null;
    return typeof detail.message === "string" ? detail.message : null;
  }

  const messages = detail.flatMap((issue) => {
    if (typeof issue === "string") return [issue];
    if (!isRecord(issue) || typeof issue.msg !== "string") return [];
    const location = Array.isArray(issue.loc)
      ? issue.loc.filter((part) => part !== "body").join(".")
      : "";
    return [location ? `${location}: ${issue.msg}` : issue.msg];
  });
  return messages.length ? messages.join(" ") : null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  Object.entries(devHeaders).forEach(([key, value]) => headers.set(key, value));
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      validationErrorMessage(isRecord(body) ? body.detail : null) ??
        "요청을 처리하지 못했습니다.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

async function listReadings(filters: ReadingListRequest = {}) {
  const { pageSize, ...query } = filters;
  const response = await request<ApiPage<ApiReadingSummary>>(
    `/reading-items${queryString({ ...query, page_size: pageSize })}`,
  );
  return { ...response, items: response.items.map((item) => toItem(item)) };
}

async function listAdminReadings(filters: AdminReadingListRequest = {}) {
  const { pageSize, ...query } = filters;
  const response = await request<ApiPage<ApiReadingSummary>>(
    `/admin/reading-items${queryString({ ...query, page_size: pageSize })}`,
  );
  return { ...response, items: response.items.map((item) => toItem(item)) };
}

export const api = {
  async signInWithGoogle(credential: string): Promise<CurrentUser> {
    const response = await request<AuthenticationResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    accessToken = response.accessToken;
    window.sessionStorage.setItem(accessTokenStorageKey, accessToken);
    return response.user;
  },
  clearAccessToken: () => {
    accessToken = null;
    window.sessionStorage.removeItem(accessTokenStorageKey);
  },
  me: () => request<CurrentUser>("/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  listReadings,
  reading: (itemId: string) =>
    request<ApiPublicReadingDetail>(`/reading-items/${itemId}`),
  async startAttempt(itemId: string): Promise<StartedAttempt> {
    const response = await request<{
      id: string;
      itemId: string;
      startedAt: string;
      choices: ApiChoice[];
      questions?: ApiReadingQuestion[];
    }>(`/reading-items/${itemId}/attempts`, {
      method: "POST",
    });
    return {
      ...response,
      choices: response.choices.map((choice) => ({
        id: choice.id,
        text: choice.text,
        isCorrect: choice.isCorrect,
        wrongExplanation: choice.wrongExplanation ?? undefined,
      })),
      questions: response.questions?.map((question) => ({
        id: question.id,
        question: question.question,
        explanation: "",
        choices: question.choices.map((choice) => ({
          id: choice.id,
          text: choice.text,
        })),
      })) ?? [],
    };
  },
  async attempt(attemptId: string): Promise<RestoredAttempt> {
    const response = await request<ApiAttemptState>(`/reading-items/attempts/${attemptId}`);
    return {
      ...response,
      item: toItem(response.item, response.item),
      answers: response.answers ?? [],
      result: response.result ? { ...response.result } : null,
    };
  },
  submitAttempt: (
    attemptId: string,
    answers: AttemptQuestionAnswer[],
    clientElapsedSeconds: number,
  ) =>
    request<SubmittedAttempt>(`/reading-items/attempts/${attemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers, clientElapsedSeconds }),
    }),
  translateReading: (itemId: string) =>
    request<ReadingTranslation>(`/reading-items/${itemId}/translation`, {
      method: "POST",
    }),
  highlights: (itemId: string) =>
    request<ApiPassageHighlight[]>(`/reading-items/${itemId}/highlights`).then(
      (highlights) => highlights.map((highlight) => ({ ...highlight })),
    ),
  highlightCollection: ({
    language,
    query,
    page = 1,
    pageSize = 5,
  }: {
    language?: "ja" | "ko";
    query?: string;
    page?: number;
    pageSize?: number;
  } = {}) => {
    const searchParams = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (language) searchParams.set("language", language);
    if (query) searchParams.set("query", query);
    return request<HighlightCollectionPage>(
      `/reading-items/highlights?${searchParams}`,
    );
  },
  createHighlight: (
    itemId: string,
    startOffset: number,
    endOffset: number,
    selectedText: string,
  ) =>
    request<ApiPassageHighlight>(`/reading-items/${itemId}/highlights`, {
      method: "POST",
      body: JSON.stringify({ startOffset, endOffset, selectedText }),
    }).then((highlight) => ({ ...highlight })),
  deleteHighlight: (itemId: string, highlightId: string) =>
    request<void>(`/reading-items/${itemId}/highlights/${highlightId}`, {
      method: "DELETE",
    }),
  setBookmark: (itemId: string, bookmarked: boolean) =>
    request<ApiBookmarkState>(`/reading-items/${itemId}/bookmark`, {
      method: bookmarked ? "PUT" : "DELETE",
    }).then((state) => state.isBookmarked),
  abandonAttempt: (attemptId: string) =>
    request<void>(`/reading-items/attempts/${attemptId}/abandon`, { method: "POST" }),
  statistics: () => request<Statistics>("/me/statistics"),
  feedback: (itemId: string, qualityRating: number, perceivedLevel: DifficultyLevel, comment: string) =>
    request<void>(`/reading-items/${itemId}/feedback`, {
      method: "PUT",
      body: JSON.stringify({ qualityRating, perceivedLevel, comment: comment || null }),
    }),
  report: (itemId: string, content: string) =>
    request<{ created: boolean }>(`/reading-items/${itemId}/reports`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  listAdminReadings,
  async adminReading(itemId: string) {
    const response = await request<ApiReadingDetail>(`/admin/reading-items/${itemId}`);
    return toItem(response, response);
  },
  updateAdminReading: async (item: ReadingItem) => {
    const response = await request<ApiReadingDetail>(`/admin/reading-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: item.title,
        passage: item.passage,
        question: item.question,
        explanation: item.explanation,
        language: item.language,
        officialLevel: item.officialLevel,
        lengthType: item.lengthType,
        topic: item.topic,
        recommendedSeconds: item.recommendedSeconds,
        choices: item.choices.map((choice) => ({
          id: choice.id,
          text: choice.text,
          isCorrect: Boolean(choice.isCorrect),
          wrongExplanation: choice.wrongExplanation ?? null,
        })),
        questions: item.questions.map((question) => ({
          id: question.id,
          question: question.question,
          explanation: question.explanation,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            text: choice.text,
            isCorrect: Boolean(choice.isCorrect),
            wrongExplanation: choice.wrongExplanation ?? null,
          })),
        })),
      }),
    });
    return toItem(response, response);
  },
  createAdminReading: async (item: ManualReadingDraft) => {
    const response = await request<ApiReadingDetail>("/admin/reading-items", {
      method: "POST",
      body: JSON.stringify({
        title: item.title,
        passage: item.passage,
        question: item.question,
        explanation: item.explanation,
        language: item.language,
        officialLevel: item.officialLevel,
        lengthType: item.lengthType,
        topic: item.topic,
        recommendedSeconds: item.recommendedSeconds,
        choices: item.choices.map((choice) => ({
          text: choice.text,
          isCorrect: Boolean(choice.isCorrect),
        })),
        questions: item.questions.map((question) => ({
          question: question.question,
          explanation: question.explanation,
          choices: question.choices.map((choice) => ({
            text: choice.text,
            isCorrect: Boolean(choice.isCorrect),
          })),
        })),
      }),
    });
    return toItem(response, response);
  },
  suggestAdminTitle: (passage: string, language: ReadingLanguage) =>
    request<{ title: string }>("/admin/reading-items/title-suggestion", {
      method: "POST",
      body: JSON.stringify({ passage, language }),
    }),
  suggestAdminTopic: (passage: string, language: ReadingLanguage) =>
    request<{ topic: Topic }>("/admin/reading-items/topic-suggestion", {
      method: "POST",
      body: JSON.stringify({ passage, language }),
    }),
  suggestAdminExplanation: (
    passage: string,
    question: string,
    choices: Choice[],
    language: ReadingLanguage,
  ) =>
    request<{ explanation: string }>("/admin/reading-items/explanation-suggestion", {
      method: "POST",
      body: JSON.stringify({
        passage,
        question,
        language,
        choices: choices.map((choice) => ({
          text: choice.text,
          isCorrect: Boolean(choice.isCorrect),
        })),
      }),
    }),
  publish: async (itemId: string) => {
    const response = await request<ApiReadingDetail>(`/admin/reading-items/${itemId}/publish`, {
      method: "POST",
    });
    return toItem(response, response);
  },
  hold: async (itemId: string) => {
    const response = await request<ApiReadingDetail>(`/admin/reading-items/${itemId}/hold`, {
      method: "POST",
    });
    return toItem(response, response);
  },
  unhold: async (itemId: string) => {
    const response = await request<ApiReadingDetail>(`/admin/reading-items/${itemId}/unhold`, {
      method: "POST",
    });
    return toItem(response, response);
  },
  deleteAdminReading: (itemId: string) =>
    request<void>(`/admin/reading-items/${itemId}`, { method: "DELETE" }),
  createGenerationJob: (values: GenerationValues, idempotencyKey: string, signal?: AbortSignal) =>
    request<GenerationJob>("/admin/generation-jobs", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      signal,
      body: JSON.stringify({
        officialLevel: values.level,
        language: values.language,
        lengthType: values.length,
        topic: values.topic,
        keywords: values.keywords,
        generatorModel: values.generatorModel,
        validatorModel: values.validatorModel,
      }),
    }),
  generationModelOptions: () =>
    request<GenerationModelOptions>("/admin/generation-model-options"),
  generationJob: (jobId: string, signal?: AbortSignal) => request<GenerationJob>(`/admin/generation-jobs/${jobId}`, { signal }),
  activeGenerationJob: (signal?: AbortSignal) => request<GenerationJob | null>("/admin/generation-jobs/active", { signal }),
  generationJobs: (page = 1, pageSize = 25) =>
    request<GenerationJobHistoryPage>(
      `/admin/generation-jobs?page=${page}&page_size=${pageSize}`,
    ),
};

export function recordFromResult(
  item: ReadingItem,
  result: SubmittedAttempt,
): AttemptRecord {
  return {
    itemId: item.id,
    status: result.isCorrect ? "correct" : "wrong",
    isCorrect: result.isCorrect,
    elapsedSeconds: result.elapsedSeconds,
    submittedAt: new Date().toISOString(),
    lengthType: item.lengthType,
    officialLevel: item.officialLevel,
  };
}
