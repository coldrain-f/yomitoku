import type {
  AttemptRecord,
  Choice,
  DifficultyLevel,
  GenerationValues,
  LengthType,
  ManualReadingDraft,
  ReadingItem,
  ReadingLanguage,
  ReadingStatus,
  Role,
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

interface ApiReadingSummary {
  id: string;
  title: string;
  language: ReadingLanguage;
  officialLevel: DifficultyLevel;
  lengthType: LengthType;
  topic: Topic;
  recommendedSeconds: number;
  status: ReadingStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  perceivedLevel: DifficultyLevel | null;
  perceivedLevelVisible: boolean;
  perceivedVoteCount: number;
  itemAccuracy: number | null;
  myLatestStatus: "correct" | "wrong" | null;
}

interface ApiReadingDetail extends ApiReadingSummary {
  passage: string;
  question: string;
  explanation?: string;
  choices: ApiChoice[];
  qualityAverage?: number | null;
  reportCount?: number;
  challengerCount?: number;
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
}

interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface ReadingListRequest {
  q?: string;
  language?: ReadingLanguage;
  level?: DifficultyLevel;
  length?: LengthType;
  status?: "correct" | "wrong" | "unstarted";
  sort?: string;
  page?: number;
  pageSize?: number;
}

interface AdminReadingListRequest extends Omit<ReadingListRequest, "status"> {
  topic?: Topic;
  status?: ReadingStatus;
}

const apiMaximumPageSize = 50;
const concurrentPageRequests = 4;

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
}

export interface PassageTranslation {
  sourceLanguage: ReadingLanguage;
  targetLanguage: ReadingLanguage;
  sourceText: string;
  translatedText: string;
}

export interface GenerationJob {
  id: string;
  status: string;
  currentNode: string;
  generatedItemId: string | null;
  errorDetail: string | null;
}

export interface GenerationModelOptions {
  models: string[];
  defaultGeneratorModel: string;
  defaultValidatorModel: string;
}

export interface GenerationUsageEvent {
  eventIndex: number;
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
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    publishedAt: summary.publishedAt,
    myLatestStatus: summary.myLatestStatus,
    passage: detail?.passage ?? "",
    question: detail?.question ?? "",
    choices,
    explanation: detail?.explanation ?? "",
    quality: detail?.qualityAverage ?? 0,
    reportCount: detail?.reportCount ?? 0,
    latestReport: "접수된 오류 제보가 없습니다.",
    validation: {
      status: "warning",
      answer: "검증 기록을 불러오는 중입니다.",
      distractor: "검증 기록을 불러오는 중입니다.",
      explanation: "검증 기록을 불러오는 중입니다.",
    },
  };
}

function queryString(values: Record<string, string | number | undefined>) {
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
    throw new Error(
      validationErrorMessage(isRecord(body) ? body.detail : null) ??
        "요청을 처리하지 못했습니다.",
    );
  }
  return response.json() as Promise<T>;
}

async function collectAllPages<T>(
  loadPage: (page: number) => Promise<ApiPage<T>>,
): Promise<ApiPage<T>> {
  const firstPage = await loadPage(1);
  if (firstPage.totalPages <= 1) return firstPage;

  const pageNumbers = Array.from(
    { length: firstPage.totalPages - 1 },
    (_, index) => index + 2,
  );
  const remainingPages: ApiPage<T>[] = [];
  for (let index = 0; index < pageNumbers.length; index += concurrentPageRequests) {
    remainingPages.push(
      ...(await Promise.all(
        pageNumbers
          .slice(index, index + concurrentPageRequests)
          .map((page) => loadPage(page)),
      )),
    );
  }
  return {
    ...firstPage,
    items: [firstPage, ...remainingPages].flatMap((page) => page.items),
  };
}

async function listReadings(filters: ReadingListRequest = {}) {
  const { pageSize, ...query } = filters;
  const response = await request<ApiPage<ApiReadingSummary>>(
    `/reading-items${queryString({ ...query, page_size: pageSize })}`,
  );
  return { ...response, items: response.items.map((item) => toItem(item)) };
}

async function listAllReadings(filters: Omit<ReadingListRequest, "page" | "pageSize"> = {}) {
  return collectAllPages((page) =>
    listReadings({ ...filters, page, pageSize: apiMaximumPageSize }),
  );
}

async function listAdminReadings(filters: AdminReadingListRequest = {}) {
  const { pageSize, ...query } = filters;
  const response = await request<ApiPage<ApiReadingSummary>>(
    `/admin/reading-items${queryString({ ...query, page_size: pageSize })}`,
  );
  return { ...response, items: response.items.map((item) => toItem(item)) };
}

async function listAllAdminReadings(
  filters: Omit<AdminReadingListRequest, "page" | "pageSize"> = {},
) {
  return collectAllPages((page) =>
    listAdminReadings({ ...filters, page, pageSize: apiMaximumPageSize }),
  );
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
  listAllReadings,
  reading: (itemId: string) =>
    request<ApiPublicReadingDetail>(`/reading-items/${itemId}`),
  async startAttempt(itemId: string): Promise<StartedAttempt> {
    const response = await request<StartedAttempt>(`/reading-items/${itemId}/attempts`, {
      method: "POST",
    });
    return {
      ...response,
      choices: response.choices.map((choice) => ({ ...choice })),
    };
  },
  submitAttempt: (attemptId: string, selectedChoiceId: string, clientElapsedSeconds: number) =>
    request<SubmittedAttempt>(`/reading-items/attempts/${attemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({ selectedChoiceId, clientElapsedSeconds }),
    }),
  translateReading: (itemId: string) =>
    request<PassageTranslation>(`/reading-items/${itemId}/translation`, {
      method: "POST",
    }),
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
  listAllAdminReadings,
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
      }),
    });
    return toItem(response, response);
  },
  suggestAdminTitle: (passage: string, language: ReadingLanguage) =>
    request<{ title: string }>("/admin/reading-items/title-suggestion", {
      method: "POST",
      body: JSON.stringify({ passage, language }),
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
  createGenerationJob: (values: GenerationValues) =>
    request<GenerationJob>("/admin/generation-jobs", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
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
  generationJob: (jobId: string) => request<GenerationJob>(`/admin/generation-jobs/${jobId}`),
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
