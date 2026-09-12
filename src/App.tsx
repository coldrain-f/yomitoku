import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AdminEdit,
  GenerationHistoryScreen,
  AdminScreen,
  GenerateScreen,
  ManualCreateScreen,
  PreviewScreen,
} from "./features/admin/AdminScreens";
import {
  ReadingListScreen,
  ReadingScreen,
  ResultScreen,
} from "./features/readings/ReadingScreens";
import { StatsScreen } from "./features/statistics/StatsScreen";
import { LoginScreen } from "./features/auth/LoginScreen";
import { WelcomeScreen } from "./features/auth/WelcomeScreen";
import { useGenerationJob } from "./features/admin/useGenerationJob";
import { AppDialogContent } from "./components/AppDialogContent";
import { AppHeader } from "./components/AppHeader";
import { Breadcrumb } from "./components/ui/Breadcrumb";
import { Dialog } from "./components/ui/Dialog";
import { Icon } from "./components/ui/Icon";
import {
  api,
  ApiError,
  recordFromResult,
  type GenerationJob,
  type GenerationJobHistory,
  type GenerationModelOptions,
  type ReadingListRequest,
  type ReadingTranslation,
  type RestoredAttempt,
  type Statistics,
  type AdminReadingListRequest,
} from "./lib/api";
import {
  defaultGenerationLanguage,
  defaultGenerationLength,
  defaultGenerationLevelByLanguage,
  listPageSize,
  readingTopics,
  recommendedSecondsByLength,
  recommendedTopic,
} from "./lib/readingPolicy";
import { formatTime } from "./lib/reading";
import { useI18n } from "./lib/i18n";
import type {
  AdminFilters,
  AttemptRecord,
  AttemptQuestionAnswer,
  DialogConfig,
  FeedbackValues,
  GenerationValues,
  HighlightCollectionPage,
  HighlightRemovalConfirmation,
  ListFilters,
  ManualReadingDraft,
  PassageHighlight,
  ReadingAttempt,
  ReadingItem,
  ReadingLanguage,
  ReadingResult,
  Role,
  Screen,
  StateSetter,
} from "./types";

const defaultListFilters: ListFilters = {
  language: defaultGenerationLanguage,
  bookmarked: false,
  level: "all",
  length: "all",
  status: "all",
  firstSubmissionTime: "all",
  sort: "published-desc",
};
const defaultAdminFilters: AdminFilters = {
  language: defaultGenerationLanguage,
  level: "all",
  length: "all",
  topic: "all",
  status: "all",
  sort: "created-desc",
};
const listFiltersStorageKey = "yomitoku.list-filters";
const adminFiltersStorageKey = "yomitoku.admin-filters";
const readingSessionStoragePrefix = "yomitoku.reading-session:";
const highlightCollectionPageSize = 5;
const emptyHighlightCollection: HighlightCollectionPage = {
  items: [],
  page: 1,
  pageSize: highlightCollectionPageSize,
  totalItems: 0,
  totalPages: 1,
};

interface StoredReadingSession {
  attemptId: string;
  itemId: string;
  selectedChoiceId: string | null;
  answers: AttemptQuestionAnswer[];
}
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

function normalizeReadingLanguage(value: unknown): ReadingLanguage {
  return value === "ko" ? "ko" : defaultGenerationLanguage;
}

function normalizeLearningResultFilter(value: unknown): ListFilters["status"] {
  return ["all", "unstarted", "wrong", "score-100", "score-90", "score-80"].includes(
    value as string,
  )
    ? value as ListFilters["status"]
    : "all";
}

function normalizeFirstSubmissionTimeFilter(
  value: unknown,
): ListFilters["firstSubmissionTime"] {
  return ["all", "on-time", "timed-out"].includes(value as string)
    ? value as ListFilters["firstSubmissionTime"]
    : "all";
}

function publicSortParameter(
  sort: ListFilters["sort"],
): NonNullable<ReadingListRequest["sort"]> {
  return ({
    "published-desc": "published_desc",
    "published-asc": "published_asc",
    "level-asc": "level_asc",
    "level-desc": "level_desc",
    "perceived-asc": "perceived_level_asc",
    "perceived-desc": "perceived_level_desc",
    "score-asc": "score_asc",
    "score-desc": "score_desc",
  } as const)[sort];
}

function adminSortParameter(
  sort: AdminFilters["sort"],
): NonNullable<AdminReadingListRequest["sort"]> {
  return ({
    "updated-desc": "updated_desc",
    "updated-asc": "updated_asc",
    "created-desc": "created_desc",
    "created-asc": "created_asc",
    "title-asc": "title_asc",
    "level-asc": "level_asc",
    "level-desc": "level_desc",
    "perceived-asc": "perceived_level_asc",
    "perceived-desc": "perceived_level_desc",
    "status-asc": "status_asc",
  } as const)[sort];
}

function readStoredFilters<T extends object>(key: string, fallback: T): T {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

function storeFilters(key: string, filters: object) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Filter controls remain usable when browser storage is unavailable.
  }
}

function readingSessionStorageKey(userId: string) {
  return readingSessionStoragePrefix + userId;
}

function readStoredReadingSession(userId: string): StoredReadingSession | null {
  try {
    const stored = window.sessionStorage.getItem(readingSessionStorageKey(userId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { attemptId, itemId, selectedChoiceId, answers } = parsed as Record<string, unknown>;
    if (typeof attemptId !== "string" || typeof itemId !== "string") return null;
    return {
      attemptId,
      itemId,
      selectedChoiceId: typeof selectedChoiceId === "string" ? selectedChoiceId : null,
      answers: Array.isArray(answers)
        ? answers.flatMap((answer) => {
            if (!answer || typeof answer !== "object" || Array.isArray(answer)) return [];
            const { questionId, selectedChoiceId: choiceId } = answer as Record<string, unknown>;
            return typeof questionId === "string"
              ? [{ questionId, selectedChoiceId: typeof choiceId === "string" ? choiceId : null }]
              : [];
          })
        : [],
    };
  } catch {
    return null;
  }
}

function storeReadingSession(userId: string, session: StoredReadingSession) {
  try {
    window.sessionStorage.setItem(readingSessionStorageKey(userId), JSON.stringify(session));
  } catch {
    // The attempt remains usable when browser storage is unavailable.
  }
}

function clearReadingSession(userId: string) {
  try {
    window.sessionStorage.removeItem(readingSessionStorageKey(userId));
  } catch {
    // No action is needed when browser storage is unavailable.
  }
}

function generationProgressLabel(job: GenerationJob) {
  if (job.status === "queued") return "생성 작업을 준비하는 중입니다.";
  if (job.currentNode === "generate") return "지문과 문항을 만드는 중입니다.";
  if (job.currentNode === "validate_schema") return "문항 형식을 확인하는 중입니다.";
  if (job.currentNode === "verify_answer") return "정답이 하나인지 검증하는 중입니다.";
  if (job.currentNode === "verify_quality") return "선택지와 해설 품질을 검토하는 중입니다.";
  if (job.currentNode === "revise") return "검증 결과를 반영해 다시 만드는 중입니다.";
  if (job.currentNode === "retry_generate") return "응답 형식을 확인하며 한 번 더 생성하는 중입니다.";
  return "생성 결과를 정리하는 중입니다.";
}

function screenForPath(pathname: string): Screen {
  if (pathname === "/login") return "login";
  if (pathname === "/statistics") return "stats";
  if (pathname.startsWith("/results/")) return "result";
  if (pathname.startsWith("/readings/")) return "reading";
  if (pathname === "/admin/generation-history") return "generation-history";
  if (pathname === "/admin/readings") return "admin";
  if (pathname === "/admin/readings/manual") return "manual-create";
  if (pathname === "/admin/readings/new") return "generate";
  if (pathname.endsWith("/preview")) return "preview";
  if (pathname.endsWith("/edit")) return "admin-edit";
  return "home";
}

function createManualReadingDraft(): ManualReadingDraft {
  const choices = Array.from({ length: 4 }, (_, index) => ({
    id: "manual-choice-1-" + (index + 1),
    text: "",
    isCorrect: index === 0,
  }));
  return {
    title: "",
    language: defaultGenerationLanguage,
    officialLevel: defaultGenerationLevelByLanguage[defaultGenerationLanguage],
    lengthType: defaultGenerationLength,
    topic: readingTopics[0],
    recommendedSeconds: recommendedSecondsByLength[defaultGenerationLength],
    passage: "",
    question: "",
    choices,
    explanation: "",
    questions: [
      {
        id: "manual-question-1",
        question: "",
        choices,
        explanation: "",
      },
    ],
  };
}

function validateManualReadingDraft(values: ManualReadingDraft) {
  if (
    !values.title.trim() ||
    !values.passage.trim() ||
    values.questions.some((question) => !question.question.trim())
  ) {
    return "제목, 지문, 문제를 모두 입력해 주세요.";
  }
  const maximum =
    values.lengthType === "short" ? 1 : values.lengthType === "medium" ? 3 : 4;
  if (values.questions.length > maximum) return "유형별 문제 수 제한을 확인해 주세요.";
  for (const question of values.questions) {
    const choices = question.choices.map((choice) => choice.text.trim());
    if (choices.some((choice) => !choice)) {
      return "각 문제의 선택지 네 개를 모두 입력해 주세요.";
    }
    if (new Set(choices).size !== choices.length) {
      return "각 문제의 선택지는 서로 다르게 입력해 주세요.";
    }
  }
  return null;
}

function RequireAuth({
  authenticated,
  children,
}: {
  authenticated: boolean;
  children: ReactNode;
}) {
  return authenticated ? children : <Navigate to="/" replace />;
}

function RequireAdmin({
  authenticated,
  role,
  children,
}: {
  authenticated: boolean;
  role: Role;
  children: ReactNode;
}) {
  return authenticated && role === "admin" ? children : <Navigate to="/" replace />;
}

function ReadingRoute({
  items,
  attempt,
  result,
  onChoose,
  onSubmit,
  isSubmitting,
  onAbandon,
  onReport,
  onTranslate,
  onResult,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
}: {
  items: ReadingItem[];
  attempt: ReadingAttempt | null;
  result: ReadingResult | null;
  onChoose: (questionId: string, choiceId: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onAbandon: () => void;
  onReport: () => void;
  onTranslate: () => void;
  onResult: () => void;
  highlights: PassageHighlight[];
  onCreateHighlight: (
    startOffset: number,
    endOffset: number,
    selectedText: string,
  ) => Promise<PassageHighlight>;
  onDeleteHighlight: (highlightId: string) => Promise<void>;
}) {
  const { itemId } = useParams();
  const item =
    items.find((entry) => entry.id === itemId) ??
    (result && result.itemId === itemId ? result.item : undefined);
  if (!item || attempt?.itemId !== item.id) return <Navigate to="/" replace />;
  return (
    <ReadingScreen
      item={item}
      attempt={attempt}
      result={result}
      onChoose={onChoose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      onAbandon={onAbandon}
      onReport={onReport}
      onTranslate={onTranslate}
      onResult={onResult}
      highlights={highlights}
      onCreateHighlight={onCreateHighlight}
      onDeleteHighlight={onDeleteHighlight}
    />
  );
}

function ResultRoute({
  result,
  onFeedback,
  onReview,
  onContinue,
  onHome,
}: {
  result: ReadingResult | null;
  onFeedback: () => void;
  onReview: () => void;
  onContinue: () => void;
  onHome: () => void;
}) {
  const { itemId } = useParams();
  if (!result || result.itemId !== itemId) return <Navigate to="/" replace />;
  return (
    <ResultScreen
      result={result}
      onFeedback={onFeedback}
      onReview={onReview}
      onContinue={onContinue}
      onHome={onHome}
    />
  );
}

function AdminEditRoute({
  items,
  draft,
  setDraft,
  onSave,
  onHold,
  onPublish,
  onDelete,
  onBack,
  isSaving,
  onConfirmQuestionTruncation,
}: {
  items: ReadingItem[];
  draft: ReadingItem | null;
  setDraft: StateSetter<ReadingItem | null>;
  onSave: () => void;
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
  isSaving: boolean;
  onConfirmQuestionTruncation: (
    removedQuestionCount: number,
    onConfirm: () => void,
  ) => void;
}) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [titleSuggestionError, setTitleSuggestionError] = useState("");
  const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);
  const [topicSuggestionError, setTopicSuggestionError] = useState("");
  const [suggestingExplanationIndex, setSuggestingExplanationIndex] = useState<number | null>(null);
  const [explanationSuggestionErrors, setExplanationSuggestionErrors] = useState<
    Record<number, string>
  >({});
  const suggestionRequestRef = useRef(0);

  useEffect(() => {
    if (item && (!draft || draft.id !== item.id)) setDraft(structuredClone(item));
  }, [draft?.id, item, setDraft]);

  useEffect(() => {
    suggestionRequestRef.current += 1;
    setIsSuggestingTitle(false);
    setTitleSuggestionError("");
    setIsSuggestingTopic(false);
    setTopicSuggestionError("");
    setSuggestingExplanationIndex(null);
    setExplanationSuggestionErrors({});
  }, [itemId]);

  if (!item) return <Navigate to="/admin/readings" replace />;
  if (!draft || draft.id !== item.id) return null;
  const suggestTitle = async () => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    if (!passage) {
      setTitleSuggestionError("지문을 먼저 입력해 주세요.");
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setIsSuggestingTitle(true);
    setTitleSuggestionError("");
    try {
      const { title } = await api.suggestAdminTitle(passage, draft.language);
      if (!title.trim()) throw new Error("AI가 제목을 만들지 못했습니다.");
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) =>
        current?.id === draftId ? { ...current, title: title.trim() } : current,
      );
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setTitleSuggestionError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "AI 제목 제안에 실패했습니다.",
      );
    } finally {
      if (suggestionRequestRef.current === requestId) setIsSuggestingTitle(false);
    }
  };
  const suggestTopic = async () => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    if (!passage) {
      setTopicSuggestionError("지문을 먼저 입력해 주세요.");
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setIsSuggestingTopic(true);
    setTopicSuggestionError("");
    try {
      const { topic } = await api.suggestAdminTopic(passage, draft.language);
      if (!readingTopics.includes(topic)) {
        throw new Error("AI가 목록에 없는 주제를 반환했습니다.");
      }
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) =>
        current?.id === draftId ? { ...current, topic } : current,
      );
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setTopicSuggestionError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "AI 주제 제안에 실패했습니다.",
      );
    } finally {
      if (suggestionRequestRef.current === requestId) setIsSuggestingTopic(false);
    }
  };
  const suggestExplanation = async (questionIndex: number) => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    const question = draft.questions[questionIndex];
    if (
      !passage ||
      !question?.question.trim() ||
      question.choices.some((choice) => !choice.text.trim())
    ) {
      setExplanationSuggestionErrors((current) => ({
        ...current,
        [questionIndex]: "지문, 문제, 선택지 네 개를 모두 입력해 주세요.",
      }));
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setSuggestingExplanationIndex(questionIndex);
    setExplanationSuggestionErrors((current) => ({ ...current, [questionIndex]: "" }));
    try {
      const { explanation } = await api.suggestAdminExplanation(
        passage,
        question.question.trim(),
        question.choices,
        draft.language,
      );
      if (!explanation.trim()) throw new Error("AI가 해설을 만들지 못했습니다.");
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) => {
        if (!current || current.id !== draftId) return current;
        const questions = current.questions.map((entry, index) =>
          index === questionIndex
            ? { ...entry, explanation: explanation.trim() }
            : entry,
        );
        const firstQuestion = questions[0];
        return {
          ...current,
          questions,
          question: firstQuestion.question,
          choices: firstQuestion.choices,
          explanation: firstQuestion.explanation,
        };
      });
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setExplanationSuggestionErrors((current) => ({
        ...current,
        [questionIndex]:
          suggestionError instanceof Error
            ? suggestionError.message
            : "AI 해설 생성에 실패했습니다.",
      }));
    } finally {
      if (suggestionRequestRef.current === requestId) {
        setSuggestingExplanationIndex(null);
      }
    }
  };
  return (
    <AdminEdit
      item={item}
      draft={draft}
      setDraft={setDraft}
      onSave={onSave}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(draft)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
      isSaving={isSaving}
      onSuggestTitle={() => void suggestTitle()}
      isSuggestingTitle={isSuggestingTitle}
      titleSuggestionError={titleSuggestionError}
      onSuggestTopic={() => void suggestTopic()}
      isSuggestingTopic={isSuggestingTopic}
      topicSuggestionError={topicSuggestionError}
      onSuggestExplanation={(questionIndex) => void suggestExplanation(questionIndex)}
      suggestingExplanationIndex={suggestingExplanationIndex}
      explanationSuggestionErrors={explanationSuggestionErrors}
      onConfirmQuestionTruncation={onConfirmQuestionTruncation}
    />
  );
}

function PreviewRoute({
  items,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: {
  items: ReadingItem[];
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
}) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return <Navigate to="/admin/readings" replace />;
  return (
    <PreviewScreen
      item={item}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(item)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
    />
  );
}

export default function App() {
  const { t, levelLabel, lengthLabel, topicLabel } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen = screenForPath(location.pathname);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("learner");
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [adminItems, setAdminItems] = useState<ReadingItem[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listTotalItems, setListTotalItems] = useState(0);
  const [listError, setListError] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminTotalItems, setAdminTotalItems] = useState(0);
  const [adminListError, setAdminListError] = useState("");
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [passageHighlights, setPassageHighlights] = useState<
    Record<string, PassageHighlight[]>
  >({});
  const [highlightCollection, setHighlightCollection] =
    useState<HighlightCollectionPage>(emptyHighlightCollection);
  const [isHighlightCollectionLoading, setIsHighlightCollectionLoading] =
    useState(false);
  const [highlightCollectionError, setHighlightCollectionError] = useState("");
  const [highlightLanguage, setHighlightLanguage] = useState<
    "all" | ReadingLanguage
  >("all");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [highlightRemoval, setHighlightRemoval] =
    useState<HighlightRemovalConfirmation | null>(null);
  const [removingHighlightId, setRemovingHighlightId] = useState<string | null>(
    null,
  );
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [bookmarkingItemIds, setBookmarkingItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isAdminListLoading, setIsAdminListLoading] = useState(false);
  const storedListFilters = useMemo(
    () => readStoredFilters(listFiltersStorageKey, defaultListFilters),
    [searchParams],
  );
  const filters = useMemo<ListFilters>(
    () => ({
      language: normalizeReadingLanguage(
        searchParams.get("language") ?? storedListFilters.language,
      ),
      bookmarked: searchParams.has("bookmarked")
        ? searchParams.get("bookmarked") === "true"
        : Boolean(storedListFilters.bookmarked),
      level:
        (searchParams.get("level") as ListFilters["level"] | null) ??
        storedListFilters.level,
      length:
        (searchParams.get("length") as ListFilters["length"] | null) ??
        storedListFilters.length,
      status: normalizeLearningResultFilter(
        searchParams.get("status") ?? storedListFilters.status,
      ),
      firstSubmissionTime: normalizeFirstSubmissionTimeFilter(
        searchParams.get("time") ?? storedListFilters.firstSubmissionTime,
      ),
      sort:
        (searchParams.get("sort") as ListFilters["sort"] | null) ??
        storedListFilters.sort,
    }),
    [searchParams, storedListFilters],
  );
  const query = searchParams.get("q") ?? "";
  const [adminQuery, setAdminQuery] = useState("");
  const [adminFilters, setAdminFilters] = useState<AdminFilters>(() => {
    const stored = readStoredFilters(adminFiltersStorageKey, defaultAdminFilters);
    return {
      ...stored,
      language: normalizeReadingLanguage(stored.language),
    };
  });
  const [filterDraft, setFilterDraft] = useState(filters);
  const [adminFilterDraft, setAdminFilterDraft] = useState(adminFilters);
  const filterDraftRef = useRef(filterDraft);
  const adminFilterDraftRef = useRef(adminFilterDraft);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [pendingStart, setPendingStart] = useState<ReadingItem | null>(null);
  const [toast, setToast] = useState("");
  const [attempt, setAttempt] = useState<ReadingAttempt | null>(null);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [translation, setTranslation] = useState<ReadingTranslation | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [draft, setDraft] = useState<ReadingItem | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualReadingDraft>(
    createManualReadingDraft,
  );
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const adminSavingRef = useRef(false);
  const submittingRef = useRef(false);
  const restoredAttemptKeyRef = useRef<string | null>(null);
  const listRequestRef = useRef(0);
  const adminListRequestRef = useRef(0);
  const highlightCollectionRequestRef = useRef(0);
  const [manualError, setManualError] = useState("");
  const [generation, setGeneration] = useState<GenerationValues>({
    language: defaultGenerationLanguage,
    level: defaultGenerationLevelByLanguage[defaultGenerationLanguage],
    length: defaultGenerationLength,
    topic: recommendedTopic,
    keywords: [],
    generatorModel: "",
    validatorModel: "",
  });
  const [generationModels, setGenerationModels] = useState<GenerationModelOptions | null>(null);
  const [generationModelsError, setGenerationModelsError] = useState("");
  const [generationHistory, setGenerationHistory] = useState<GenerationJobHistory[]>([]);
  const [generationHistoryPage, setGenerationHistoryPage] = useState(1);
  const [generationHistoryTotalPages, setGenerationHistoryTotalPages] = useState(1);
  const [generationHistoryTotalItems, setGenerationHistoryTotalItems] = useState(0);
  const [isGenerationHistoryLoading, setIsGenerationHistoryLoading] = useState(false);
  const [generationHistoryError, setGenerationHistoryError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const generationJob = useGenerationJob(authenticated && role === "admin" ? userId : null);
  const isGenerating = generationJob.isPending || Boolean(generationJob.job?.generatedItemId);
  const generationProgress = generationJob.job
    ? generationProgressLabel(generationJob.job) : "기존 생성 작업을 확인하는 중입니다.";
  const [reportText, setReportText] = useState("");
  const reportTextRef = useRef(reportText);
  const [feedback, setFeedback] = useState<FeedbackValues>({
    quality: "",
    level: "",
    comment: "",
  });
  const feedbackRef = useRef(feedback);

  const activeItem = items.find((item) => item.id === attempt?.itemId);
  const languageStatistics = statistics?.byLanguage?.find(
    (group) => group.key === filters.language,
  );
  const completeCount =
    languageStatistics?.completedCount ?? statistics?.completedCount ?? 0;
  const totalGenerated =
    languageStatistics?.totalCount ?? statistics?.totalGeneratedCount ?? 0;

  const loadPublicItems = async (page = listPage) => {
    const requestId = ++listRequestRef.current;
    setIsListLoading(true);
    setListError("");
    try {
      const response = await api.listReadings({
        q: query.trim() || undefined,
        language: filters.language,
        level: filters.level === "all" ? undefined : filters.level,
        length: filters.length === "all" ? undefined : filters.length,
        status:
          !authenticated || filters.status === "all" ? undefined : filters.status,
        time:
          !authenticated || filters.firstSubmissionTime === "all"
            ? undefined
            : filters.firstSubmissionTime,
        bookmarked: authenticated && filters.bookmarked ? true : undefined,
        sort:
          !authenticated && filters.sort.startsWith("score")
            ? "published_desc"
            : publicSortParameter(filters.sort),
        page,
        pageSize: listPageSize,
      });
      if (requestId !== listRequestRef.current) return;
      setItems((current) =>
        response.items.map((item) => {
          const loaded = current.find((entry) => entry.id === item.id);
          return loaded?.passage
            ? {
                ...item,
                passage: loaded.passage,
                question: loaded.question,
                choices: loaded.choices,
                explanation: loaded.explanation,
              }
            : item;
        }),
      );
      setListPage(response.page);
      setListTotalPages(response.totalPages);
      setListTotalItems(response.totalItems);
    } catch (error) {
      if (requestId === listRequestRef.current) {
        setListError(error instanceof Error ? error.message : t("list.failed"));
      }
    } finally {
      if (requestId === listRequestRef.current) setIsListLoading(false);
    }
  };
  const loadStatistics = async () => setStatistics(await api.statistics());
  const loadPassageHighlights = async (itemId: string) => {
    const highlights = await api.highlights(itemId);
    setPassageHighlights((current) => ({ ...current, [itemId]: highlights }));
  };
  const createPassageHighlight = async (
    itemId: string,
    startOffset: number,
    endOffset: number,
    selectedText: string,
  ) => {
    const highlight = await api.createHighlight(
      itemId,
      startOffset,
      endOffset,
      selectedText,
    );
    setPassageHighlights((current) => {
      const existing = current[itemId] ?? [];
      return {
        ...current,
        [itemId]: [...existing.filter((entry) => entry.id !== highlight.id), highlight]
          .sort((left, right) => left.startOffset - right.startOffset),
      };
    });
    return highlight;
  };
  const deletePassageHighlight = async (itemId: string, highlightId: string) => {
    await api.deleteHighlight(itemId, highlightId);
    setPassageHighlights((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).filter((entry) => entry.id !== highlightId),
    }));
  };
  const removeHighlightFromCollection = async (
    itemId: string,
    highlightId: string,
  ) => {
    if (removingHighlightId) return;
    setRemovingHighlightId(highlightId);
    setHighlightCollectionError("");
    try {
      await api.deleteHighlight(itemId, highlightId);
      setHighlightCollection((current) => {
        const removedGroup = current.items.find(
          (item) =>
            item.readingItemId === itemId &&
            item.highlights.some((highlight) => highlight.id === highlightId),
        );
        const items = current.items.flatMap((item) => {
          if (item.readingItemId !== itemId) return [item];
          const highlights = item.highlights.filter(
            (highlight) => highlight.id !== highlightId,
          );
          return highlights.length ? [{ ...item, highlights }] : [];
        });
        const totalItems = Math.max(
          0,
          current.totalItems - (removedGroup?.highlights.length === 1 ? 1 : 0),
        );
        return {
          ...current,
          items,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / current.pageSize)),
        };
      });
      setPassageHighlights((current) => ({
        ...current,
        [itemId]: (current[itemId] ?? []).filter(
          (highlight) => highlight.id !== highlightId,
        ),
      }));
      setToast(t("highlights.removeSuccess"));
    } catch (error) {
      setHighlightCollectionError(
        error instanceof Error ? error.message : t("highlights.removeFailed"),
      );
    } finally {
      setRemovingHighlightId(null);
    }
  };
  const loadGenerationModels = async () => {
    setGenerationModelsError("");
    try {
      const modelOptions = await api.generationModelOptions();
      setGenerationModels(modelOptions);
      setGeneration((current) => ({
        ...current,
        generatorModel: modelOptions.models.includes(current.generatorModel)
          ? current.generatorModel
          : modelOptions.defaultGeneratorModel,
        validatorModel: modelOptions.models.includes(current.validatorModel)
          ? current.validatorModel
          : modelOptions.defaultValidatorModel,
      }));
    } catch (error) {
      setGenerationModels(null);
      setGenerationModelsError(
        error instanceof Error ? error.message : "AI 모델 목록을 불러오지 못했습니다.",
      );
    }
  };
  const loadGenerationHistory = async (page = 1) => {
    setIsGenerationHistoryLoading(true);
    setGenerationHistoryError("");
    try {
      const response = await api.generationJobs(page);
      setGenerationHistory(response.items);
      setGenerationHistoryPage(response.page);
      setGenerationHistoryTotalPages(response.totalPages);
      setGenerationHistoryTotalItems(response.totalItems);
    } catch (error) {
      setGenerationHistoryError(
        error instanceof Error ? error.message : "생성 이력을 불러오지 못했습니다.",
      );
    } finally {
      setIsGenerationHistoryLoading(false);
    }
  };
  const loadAdminItems = async (page = adminPage) => {
    const requestId = ++adminListRequestRef.current;
    setIsAdminListLoading(true);
    setAdminListError("");
    try {
      const response = await api.listAdminReadings({
        q: adminQuery.trim() || undefined,
        language: adminFilters.language,
        level: adminFilters.level === "all" ? undefined : adminFilters.level,
        length: adminFilters.length === "all" ? undefined : adminFilters.length,
        topic: adminFilters.topic === "all" ? undefined : adminFilters.topic,
        status: adminFilters.status === "all" ? undefined : adminFilters.status,
        sort: adminSortParameter(adminFilters.sort),
        page,
        pageSize: listPageSize,
      });
      if (requestId !== adminListRequestRef.current) return;
      setAdminItems(response.items);
      setAdminPage(response.page);
      setAdminTotalPages(response.totalPages);
      setAdminTotalItems(response.totalItems);
      setAdminLoaded(true);
    } catch (error) {
      if (requestId === adminListRequestRef.current) {
        setAdminListError(
          error instanceof Error ? error.message : "관리 목록을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === adminListRequestRef.current) setIsAdminListLoading(false);
    }
  };
  const replaceAdminItem = (next: ReadingItem) =>
    setAdminItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current],
    );
  const hydrateRestoredAttempt = (
    restored: RestoredAttempt,
    storedSession: StoredReadingSession | null,
  ) => {
    void loadPassageHighlights(restored.itemId).catch(() => undefined);
    const storedAnswers = new Map(
      (storedSession?.answers ?? []).map((answer) => [answer.questionId, answer.selectedChoiceId]),
    );
    const answers = restored.item.questions.map((question, index) => {
      const validChoiceIds = new Set(question.choices.map((choice) => choice.id));
      const restoredChoice = restored.answers.find(
        (answer) => answer.questionId === question.id,
      )?.selectedChoiceId;
      const storedChoice = storedAnswers.get(question.id) ?? (
        index === 0 ? storedSession?.selectedChoiceId : null
      );
      const selectedChoiceId = [restoredChoice, storedChoice].find(
        (choiceId): choiceId is string => Boolean(choiceId && validChoiceIds.has(choiceId)),
      ) ?? null;
      return { questionId: question.id, selectedChoiceId };
    });
    const selectedChoiceId = answers[0]?.selectedChoiceId ?? null;
    const nextAttempt: ReadingAttempt = {
      attemptId: restored.id,
      itemId: restored.itemId,
      startedAt: new Date(restored.startedAt).getTime(),
      elapsedSeconds: restored.elapsedSeconds,
      selectedChoiceId,
      choices: restored.item.choices,
      submitted: restored.submitted,
      message: "",
      questions: restored.item.questions,
      answers,
    };
    setItems((current) =>
      current.some((item) => item.id === restored.item.id)
        ? current.map((item) =>
            item.id === restored.item.id ? restored.item : item,
          )
        : [restored.item, ...current],
    );
    setAttempt(nextAttempt);
    submittingRef.current = false;
    setIsSubmitting(false);
    const submitted = restored.result;
    if (!submitted) {
      setResult(null);
      return;
    }
    const nextResult: ReadingResult = {
      itemId: restored.itemId,
      item: restored.item,
      choices: restored.item.choices,
      selectedChoiceId: submitted.selectedChoiceId,
      correctChoiceId: submitted.correctChoiceId,
      isCorrect: submitted.isCorrect,
      elapsedSeconds: submitted.elapsedSeconds,
      explanation: submitted.explanation,
      selectedChoiceWrongExplanation:
        submitted.selectedChoiceWrongExplanation,
      itemAccuracy: submitted.itemAccuracy,
      challengerCount: submitted.challengerCount,
      questionResults: submitted.questionResults,
    };
    setResult(nextResult);
    setAttempts((current) => [
      ...current.filter((entry) => entry.itemId !== restored.itemId),
      recordFromResult(restored.item, submitted),
    ]);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await api.me();
        if (!active) return;
        setAuthenticated(true);
        setUserId(user.id);
        setRole(user.role);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuthenticated(false);
          setUserId(null);
          setRole("learner");
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          setToast(error instanceof Error ? error.message : "서버에 연결할 수 없습니다.");
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadPublicItems();
  }, [authLoading, authenticated, filters, listPage, query]);

  useEffect(() => {
    if (!authenticated) return;
    void loadStatistics().catch((error: unknown) =>
      setToast(error instanceof Error ? error.message : "통계를 불러오지 못했습니다."),
    );
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || role !== "admin") return;
    void loadAdminItems();
  }, [adminFilters, adminPage, adminQuery, authenticated, role]);

  useEffect(() => {
    if (!authenticated || role !== "admin") return;
    void loadGenerationModels();
  }, [authenticated, role]);

  useEffect(() => {
    if (!authenticated || !userId || !attempt) return;
    storeReadingSession(userId, {
      attemptId: attempt.attemptId,
      itemId: attempt.itemId,
      selectedChoiceId: attempt.selectedChoiceId,
      answers: attempt.answers,
    });
  }, [attempt?.attemptId, attempt?.itemId, attempt?.selectedChoiceId, authenticated, userId]);

  useEffect(() => {
    if (authenticated || !userId) return;
    clearReadingSession(userId);
  }, [authenticated, userId]);

  useEffect(() => {
    if (!authenticated || !userId || authLoading) return;
    const match = location.pathname.match(/^\/(?:readings|results)\/([^/]+)$/);
    if (!match || attempt?.itemId === match[1]) return;
    const stored = readStoredReadingSession(userId);
    if (!stored || stored.itemId !== match[1]) return;
    const key = `${userId}:${stored.attemptId}:${location.pathname}`;
    if (restoredAttemptKeyRef.current === key) return;
    restoredAttemptKeyRef.current = key;
    let active = true;

    void api
      .attempt(stored.attemptId)
      .then((restored) => {
        if (!active || restored.itemId !== stored.itemId) return;
        hydrateRestoredAttempt(restored, stored);
      })
      .catch(() => {
        clearReadingSession(userId);
      });
    return () => {
      active = false;
    };
  }, [attempt?.itemId, authLoading, authenticated, location.pathname, userId]);

  useEffect(() => {
    const conditions = generationJob.job?.conditions;
    if (!conditions) return;
    setGeneration((current) => ({
      ...current, language: conditions.language, level: conditions.officialLevel,
      length: conditions.lengthType, topic: conditions.topic, keywords: conditions.keywords,
    }));
  }, [generationJob.job?.id]);

  useEffect(() => {
    const itemId = generationJob.job?.generatedItemId;
    if (!itemId || location.pathname !== "/admin/readings/new") return;
    let active = true;
    let timer: number;
    const openResult = async () => {
      try {
        const item = await api.adminReading(itemId);
        if (!active) return;
        replaceAdminItem(item);
        navigate(`/admin/readings/${item.id}/preview`);
        generationJob.clearResult();
      } catch {
        if (active) {
          setToast("문항은 생성되었습니다. 검토 화면을 다시 불러오는 중입니다.");
          timer = window.setTimeout(() => void openResult(), 5_000);
        }
      }
    };
    void openResult();
    return () => { active = false; window.clearTimeout(timer); };
  }, [generationJob.job?.generatedItemId, location.pathname]);

  useEffect(() => {
    if (
      authenticated &&
      role === "admin" &&
      location.pathname === "/admin/generation-history"
    ) {
      void loadGenerationHistory();
    }
  }, [authenticated, location.pathname, role]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    filterDraftRef.current = filterDraft;
  }, [filterDraft]);
  useEffect(() => {
    adminFilterDraftRef.current = adminFilterDraft;
  }, [adminFilterDraft]);
  useEffect(() => {
    storeFilters(adminFiltersStorageKey, adminFilters);
  }, [adminFilters]);
  useEffect(() => {
    reportTextRef.current = reportText;
  }, [reportText]);
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);
  useEffect(() => {
    if (screen !== "reading" || !attempt || attempt.submitted) return undefined;
    const tick = () =>
      setAttempt((current) =>
        current
          ? { ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) }
          : current,
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.startedAt, attempt?.submitted, screen]);

  const closeDialog = () => {
    setDialog(null);
    setDialogError("");
  };
  const openDialog = (value: DialogConfig) => {
    setDialogError("");
    setDialog(value);
  };
  const confirmQuestionTruncation = (
    removedQuestionCount: number,
    onConfirm: () => void,
  ) =>
    openDialog({
      kicker: "Change type",
      title: "문제를 삭제하고 유형을 바꿀까요?",
      description: `유형을 바꾸면 뒤의 ${removedQuestionCount}개 문제는 삭제됩니다.`,
      confirmLabel: "삭제하고 변경",
      onConfirm: () => {
        closeDialog();
        onConfirm();
      },
    });
  const writeListParams = (
    next: ListFilters & { query: string },
    { replace = false }: { replace?: boolean } = {},
  ) => {
    storeFilters(listFiltersStorageKey, {
      language: next.language,
      bookmarked: next.bookmarked,
      level: next.level,
      length: next.length,
      status: next.status,
      firstSubmissionTime: next.firstSubmissionTime,
      sort: next.sort,
    });
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    params.set("language", next.language);
    if (next.bookmarked) params.set("bookmarked", "true");
    if (next.level !== "all") params.set("level", next.level);
    if (next.length !== "all") params.set("length", next.length);
    if (next.status !== "all") params.set("status", next.status);
    if (next.firstSubmissionTime !== "all") {
      params.set("time", next.firstSubmissionTime);
    }
    if (next.sort !== "published-desc") params.set("sort", next.sort);
    setSearchParams(params, { replace });
  };
  const setListFilters = (next: ListFilters) => {
    setListPage(1);
    writeListParams({ ...next, query });
  };
  const setListQuery = (nextQuery: string) => {
    setListPage(1);
    writeListParams({ ...filters, query: nextQuery }, { replace: true });
  };
  const updateAdminFilters = (
    next: AdminFilters | ((current: AdminFilters) => AdminFilters),
  ) => {
    setAdminPage(1);
    setAdminFilters(next);
  };

  const openStartDialog = (item: ReadingItem) => {
    const hasScore = item.myScore !== null;
    const hasPreviousSubmission = hasScore || item.myLatestStatus !== null;
    const previousResult = hasScore
      ? t("start.previousScore", { score: item.myScore ?? "" })
      : item.myLatestStatus === "wrong"
        ? t("start.previousWrong")
        : item.myLatestStatus === "correct"
          ? t("start.previousCorrect")
          : null;
    return openDialog({
      kicker: t("start.kicker"),
      title:
        !hasScore && item.myLatestStatus === "wrong"
          ? t("start.retryWrong")
          : hasPreviousSubmission
            ? t("start.retry")
            : t("start.begin"),
      context: item.title,
      contextMeta: [levelLabel(item.officialLevel), lengthLabel(item.lengthType), topicLabel(item.topic)],
      description: hasPreviousSubmission
        ? t("start.retryDescription", { previous: previousResult ?? "" })
        : t("start.description", { time: formatTime(item.recommendedSeconds) }),
      confirmLabel: hasPreviousSubmission ? t("start.retryButton") : t("start.button"),
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            const [detail, started] = await Promise.all([
              api.reading(item.id),
              api.startAttempt(item.id),
            ]);
            void loadPassageHighlights(item.id).catch(() => undefined);
            const readingItem: ReadingItem = {
              ...item,
              title: detail.title,
              language: detail.language,
              officialLevel: detail.officialLevel,
              lengthType: detail.lengthType,
              topic: detail.topic,
              recommendedSeconds: detail.recommendedSeconds,
              passage: detail.passage,
              question: detail.question,
              choices: started.choices,
              questions: started.questions,
            };
            setItems((current) =>
              current.map((currentItem) =>
                currentItem.id === readingItem.id ? readingItem : currentItem,
              ),
            );
            setResult(null);
            submittingRef.current = false;
            setIsSubmitting(false);
            setAttempt({
              attemptId: started.id,
              itemId: item.id,
              startedAt: Date.now(),
              elapsedSeconds: 0,
              selectedChoiceId: null,
              choices: started.choices,
              submitted: false,
              message: "",
              questions: started.questions,
              answers: started.questions.map((question) => ({
                questionId: question.id,
                selectedChoiceId: null,
              })),
            });
            navigate(`/readings/${item.id}`);
          } catch (error) {
            setToast(error instanceof Error ? error.message : t("start.openFailed"));
          }
        })();
      },
    });
  };

  const start = (item: ReadingItem) => {
    if (authenticated) {
      openStartDialog(item);
      return;
    }
    setPendingStart(item);
    openLogin();
  };

  const abandonAndNavigate = (target: string, targetLabel: string) => {
    if (screen !== "reading" || !attempt || attempt.submitted) {
      navigate(target);
      return;
    }
    openDialog({
      kicker: t("leave.kicker"),
      title: t("leave.title"),
      description: t("leave.description", { target: targetLabel }),
      confirmLabel: t("leave.confirm"),
      onConfirm: () => {
        closeDialog();
        void api.abandonAttempt(attempt.attemptId);
        if (userId) clearReadingSession(userId);
        setAttempt(null);
        navigate(target);
        setToast(t("leave.completed", { target: targetLabel }));
      },
    });
  };
  const goHome = () => {
    if (screen !== "home") abandonAndNavigate("/", t("leave.list"));
  };

  const submit = () => {
    if (!attempt || !activeItem || submittingRef.current) return;
    if (attempt.answers.some((answer) => !answer.selectedChoiceId)) {
      setAttempt({ ...attempt, message: t("submit.selectAll") });
      return;
    }
    const answers = attempt.answers;
    openDialog({
      kicker: t("submit.kicker"),
      title: t("submit.title"),
      description: t("submit.description"),
      confirmLabel: t("submit.confirm"),
      onConfirm: () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        closeDialog();
        void (async () => {
          try {
            const submitted = await api.submitAttempt(
              attempt.attemptId,
              answers,
              attempt.elapsedSeconds,
            );
            const nextResult: ReadingResult = {
              itemId: activeItem.id,
              item: activeItem,
              choices: attempt.choices,
              selectedChoiceId: submitted.selectedChoiceId,
              correctChoiceId: submitted.correctChoiceId,
              isCorrect: submitted.isCorrect,
              elapsedSeconds: submitted.elapsedSeconds,
              explanation: submitted.explanation,
              selectedChoiceWrongExplanation: submitted.selectedChoiceWrongExplanation,
              itemAccuracy: submitted.itemAccuracy,
              challengerCount: submitted.challengerCount,
              questionResults: submitted.questionResults,
            };
            setResult(nextResult);
            setAttempt({ ...attempt, submitted: true, elapsedSeconds: submitted.elapsedSeconds });
            setAttempts((current) => [...current, recordFromResult(activeItem, submitted)]);
            await Promise.all([loadStatistics(), loadPublicItems()]);
          } catch (error) {
            submittingRef.current = false;
            setIsSubmitting(false);
            setToast(error instanceof Error ? error.message : t("submit.failed"));
          }
        })();
      },
    });
  };

  const deleteItem = (item: ReadingItem, target = "/admin/readings") =>
    openDialog({
      kicker: "Delete item",
      title: "문항을 삭제할까요?",
      description: "문항과 연결된 기록을 영구 삭제합니다. 삭제한 문항은 복구할 수 없습니다.",
      confirmLabel: "삭제하기",
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            await api.deleteAdminReading(item.id);
            setAdminItems((current) => current.filter((entry) => entry.id !== item.id));
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            setAttempts((current) => current.filter((entry) => entry.itemId !== item.id));
            await loadStatistics();
            navigate(target);
            setToast("문항을 삭제했습니다.");
          } catch (error) {
            setToast(error instanceof Error ? error.message : "문항을 삭제하지 못했습니다.");
          }
        })();
      },
    });

  const createDraft = () =>
    openDialog({
      kicker: "Generate reading",
      title: "새 독해 지문을 만들까요?",
      description: "선택한 조건으로 지문과 문항을 만든 뒤 검토 화면으로 이동합니다.",
      confirmLabel: "지문 만들기",
      onConfirm: () => {
        closeDialog();
        if (!generation.generatorModel || !generation.validatorModel) {
          setToast("AI 모델 목록을 불러온 뒤 다시 시도해 주세요.");
          return;
        }
        generationJob.start(generation);
      },
    });

  const openListFilters = () => {
    setFilterDraft(filters);
    openDialog({
      type: "list-filter",
      kicker: t("filters.kicker"),
      title: t("filters.title"),
      description: t("filters.description"),
      confirmLabel: t("filters.apply"),
      onConfirm: () => {
        setListFilters(filterDraftRef.current);
        closeDialog();
      },
      onReset: () => {
        const reset = {
          ...filterDraftRef.current,
          level: "all" as const,
          length: "all" as const,
          status: "all" as const,
          firstSubmissionTime: "all" as const,
          sort: "published-desc" as const,
        };
        filterDraftRef.current = reset;
        setFilterDraft(reset);
      },
    });
  };
  const openScoreGuide = () =>
    openDialog({
      type: "score-guide",
      kicker: t("score.kicker"),
      title: t("score.title"),
      description: "",
    });
  const showHighlightCollectionDialog = () =>
    openDialog({
      type: "highlights",
      kicker: t("highlights.kicker"),
      title: t("highlights.title"),
      description: "",
    });
  const loadHighlightCollection = ({
    language = highlightLanguage,
    query = highlightQuery,
    page = highlightCollection.page,
  }: {
    language?: "all" | ReadingLanguage;
    query?: string;
    page?: number;
  } = {}) => {
    const requestId = highlightCollectionRequestRef.current + 1;
    highlightCollectionRequestRef.current = requestId;
    setHighlightCollectionError("");
    setIsHighlightCollectionLoading(true);
    return api
      .highlightCollection({
        language: language === "all" ? undefined : language,
        query: query.trim() || undefined,
        page,
        pageSize: highlightCollectionPageSize,
      })
      .then((collection) => {
        if (highlightCollectionRequestRef.current === requestId) {
          setHighlightCollection(collection);
        }
      })
      .catch((error: unknown) => {
        if (highlightCollectionRequestRef.current === requestId) {
          setHighlightCollectionError(
            error instanceof Error
              ? error.message
              : t("highlights.failed"),
          );
        }
      })
      .finally(() => {
        if (highlightCollectionRequestRef.current === requestId) {
          setIsHighlightCollectionLoading(false);
        }
      });
  };
  const openHighlightCollection = () => {
    if (!authenticated) {
      openLogin();
      return;
    }
    setHighlightLanguage("all");
    setHighlightQuery("");
    setHighlightCollection(emptyHighlightCollection);
    setHighlightCollectionError("");
    setRemovingHighlightId(null);
    setHighlightRemoval(null);
    showHighlightCollectionDialog();
    void loadHighlightCollection({ language: "all", query: "", page: 1 });
  };
  const confirmHighlightRemoval = (itemId: string, highlightId: string) => {
    const item = highlightCollection.items.find((entry) =>
      entry.highlights.some((highlight) => highlight.id === highlightId),
    );
    const highlight = item?.highlights.find((entry) => entry.id === highlightId);
    if (!item || !highlight || removingHighlightId) return;
    setHighlightRemoval({
      readingItemId: itemId,
      highlightId,
      title: item.title,
      language: item.language,
      officialLevel: item.officialLevel,
      lengthType: item.lengthType,
      topic: item.topic,
      selectedText: highlight.selectedText,
    });
  };
  const openAdminFilters = () => {
    setAdminFilterDraft(adminFilters);
    openDialog({
      type: "admin-filter",
      kicker: "Filter management",
      title: "문항 필터 및 정렬",
      description: "조건을 선택한 뒤 적용해 주세요.",
      confirmLabel: "적용하기",
      onConfirm: () => {
        updateAdminFilters(adminFilterDraftRef.current);
        closeDialog();
      },
      onReset: () => {
        const reset = {
          ...adminFilterDraftRef.current,
          level: "all" as const,
          length: "all" as const,
          topic: "all" as const,
          status: "all" as const,
          sort: "created-desc" as const,
        };
        adminFilterDraftRef.current = reset;
        setAdminFilterDraft(reset);
      },
    });
  };

  const openReport = () => {
    if (!activeItem) return;
    setReportText("");
    openDialog({
      type: "report",
      kicker: t("report.kicker"),
      title: t("report.title"),
      description: t("report.description"),
      confirmLabel: t("report.confirm"),
      onConfirm: () => {
        const content = reportTextRef.current.trim();
        if (!content) {
          setDialogError(t("report.empty"));
          return;
        }
        closeDialog();
        void api
          .report(activeItem.id, content)
          .then(() => setToast(t("report.success")))
          .catch((error: unknown) =>
            setToast(error instanceof Error ? error.message : t("report.failed")),
          );
      },
    });
  };
  const openTranslation = () => {
    if (!result || !attempt?.submitted) return;
    setTranslation(null);
    setTranslationError("");
    setTranslationLoading(true);
    openDialog({
      type: "translation",
      kicker: t("translation.kicker"),
      title: t("translation.title"),
      description: t("translation.description"),
    });
    void api
      .translateReading(result.itemId)
      .then(setTranslation)
      .catch((error: unknown) =>
        setTranslationError(
          error instanceof Error ? error.message : t("translation.failed"),
        ),
      )
      .finally(() => setTranslationLoading(false));
  };
  const openFeedback = () => {
    if (!result) return;
    setFeedback({ quality: "", level: "", comment: "" });
    openDialog({
      type: "feedback",
      kicker: t("feedback.kicker"),
      title: t("feedback.title"),
      description: t("feedback.description"),
      confirmLabel: t("feedback.confirm"),
      onConfirm: () => {
        const values = feedbackRef.current;
        if (!values.quality || !values.level) {
          setDialogError(t("feedback.empty"));
          return;
        }
        closeDialog();
        void api
          .feedback(result.itemId, Number(values.quality), values.level, values.comment)
          .then(() => setToast(t("feedback.success")))
          .catch((error: unknown) =>
            setToast(error instanceof Error ? error.message : t("feedback.failed")),
          );
      },
    });
  };

  const completeGoogleLogin = (credential: string) => {
    const itemToStart = pendingStart;
    void (async () => {
    try {
      const user = await api.signInWithGoogle(credential);
      setAuthenticated(true);
      setUserId(user.id);
      setRole(user.role);
      await Promise.all([
        loadPublicItems(),
        loadStatistics(),
        ...(user.role === "admin" ? [loadAdminItems(), loadGenerationModels()] : []),
      ]);
      setPendingStart(null);
      setDialogError("");
      navigate("/", { replace: true });
      setToast(t("auth.success"));
      if (itemToStart) openStartDialog(itemToStart);
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : t("auth.failed"),
      );
    }
    })();
  };
  const openLogin = () => {
    setDialogError("");
    navigate("/login");
  };
  const saveBookmark = async (item: ReadingItem) => {
    if (!authenticated) {
      openLogin();
      return;
    }
    if (bookmarkingItemIds.has(item.id)) return;

    const nextBookmarked = !item.isBookmarked;
    setBookmarkingItemIds((current) => new Set(current).add(item.id));
    try {
      const isBookmarked = await api.setBookmark(item.id, nextBookmarked);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, isBookmarked } : entry,
        ),
      );
      if (filters.bookmarked && !isBookmarked) {
        await loadPublicItems();
      }
      setToast(isBookmarked ? t("bookmark.addSuccess") : t("bookmark.removeSuccess"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("bookmark.failed"));
    } finally {
      setBookmarkingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };
  const toggleBookmark = (item: ReadingItem) => {
    if (!authenticated) {
      openLogin();
      return;
    }
    if (bookmarkingItemIds.has(item.id)) return;

    const willBookmark = !item.isBookmarked;
    openDialog({
      kicker: t("bookmark.kicker"),
      title: willBookmark ? t("bookmark.addTitle") : t("bookmark.removeTitle"),
      context: item.title,
      contextMeta: [levelLabel(item.officialLevel), lengthLabel(item.lengthType), topicLabel(item.topic)],
      description: willBookmark
        ? t("bookmark.addDescription")
        : t("bookmark.removeDescription"),
      confirmLabel: willBookmark ? t("bookmark.addConfirm") : t("bookmark.removeConfirm"),
      onConfirm: () => {
        closeDialog();
        void saveBookmark(item);
      },
    });
  };
  const logout = () => {
    void api.logout().catch(() => undefined);
    api.clearAccessToken();
    if (userId) clearReadingSession(userId);
    restoredAttemptKeyRef.current = null;
    setAuthenticated(false);
    setUserId(null);
    setRole("learner");
    setAttempt(null);
    setResult(null);
    setStatistics(null);
    setPassageHighlights({});
    setHighlightCollection(emptyHighlightCollection);
    setHighlightCollectionError("");
    setRemovingHighlightId(null);
    setHighlightRemoval(null);
    setBookmarkingItemIds(new Set());
    if (filters.bookmarked) {
      writeListParams({ ...filters, bookmarked: false, query });
    }
    navigate("/");
    setToast(t("auth.logout"));
  };

  const openEdit = (item: ReadingItem) => {
    void (async () => {
      try {
        const detail = await api.adminReading(item.id);
        replaceAdminItem(detail);
        setDraft(structuredClone(detail));
        navigate(`/admin/readings/${detail.id}/edit`);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "문항을 불러오지 못했습니다.");
      }
    })();
  };
  const leaveEditor = (target = "/admin/readings", targetLabel = "관리 목록", afterLeave?: () => void) => {
    const original = adminItems.find((item) => item.id === draft?.id);
    const snapshot = (item: ReadingItem) =>
      JSON.stringify({
        title: item.title,
        language: item.language,
        officialLevel: item.officialLevel,
        lengthType: item.lengthType,
        topic: item.topic,
        passage: item.passage,
        question: item.question,
        choices: item.choices.map(({ id, text, isCorrect }) => ({ id, text, isCorrect })),
        explanation: item.explanation,
      });
    if (!draft || !original) {
      setDraft(null);
      afterLeave?.();
      navigate(target);
      return;
    }
    const changed = snapshot(draft) !== snapshot(original);
    openDialog({
      kicker: changed ? "Discard changes" : "Leave editor",
      title: changed ? "저장하지 않은 변경사항을 버릴까요?" : `${targetLabel}으로 이동할까요?`,
      description: changed
        ? `저장하지 않은 편집 내용은 사라지고 ${targetLabel}으로 이동합니다.`
        : `현재 문항 편집을 닫고 ${targetLabel}으로 이동합니다.`,
      confirmLabel: changed ? "변경사항 버리기" : "이동하기",
      onConfirm: () => {
        closeDialog();
        setDraft(null);
        afterLeave?.();
        navigate(target);
      },
    });
  };
  const updateAdminItem = async (item: ReadingItem) => {
    if (adminSavingRef.current) return;
    adminSavingRef.current = true;
    setIsAdminSaving(true);
    try {
      const next = await api.updateAdminReading(item);
      replaceAdminItem(next);
      setDraft(structuredClone(next));
      setToast("문항 변경사항을 저장했습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "문항을 저장하지 못했습니다.");
    } finally {
      adminSavingRef.current = false;
      setIsAdminSaving(false);
    }
  };
  const createManualReading = async () => {
    const validationError = validateManualReadingDraft(manualDraft);
    if (validationError) {
      setManualError(validationError);
      return;
    }
    setIsManualSaving(true);
    setManualError("");
    try {
      const next = await api.createAdminReading(manualDraft);
      replaceAdminItem(next);
      setManualDraft(createManualReadingDraft());
      setDraft(structuredClone(next));
      navigate("/admin/readings/" + next.id + "/edit");
      setToast("문항을 검토 상태로 저장했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "문항을 저장하지 못했습니다.";
      setManualError(message);
      setToast(message);
    } finally {
      setIsManualSaving(false);
    }
  };
  const leaveManualCreate = (
    target = "/admin/readings",
    targetLabel = "관리 목록",
    afterLeave?: () => void,
  ) => {
    const hasContent =
      Boolean(manualDraft.title.trim()) ||
      Boolean(manualDraft.passage.trim()) ||
      Boolean(manualDraft.question.trim()) ||
      Boolean(manualDraft.explanation.trim()) ||
      manualDraft.choices.some((choice) => Boolean(choice.text.trim()));
    if (!hasContent) {
      setManualDraft(createManualReadingDraft());
      setManualError("");
      afterLeave?.();
      navigate(target);
      return;
    }
    openDialog({
      kicker: "Discard draft",
      title: "작성 중인 문항을 버릴까요?",
      description: "저장하지 않은 입력 내용은 사라지고 " + targetLabel + "으로 이동합니다.",
      confirmLabel: "작성 내용 버리기",
      onConfirm: () => {
        closeDialog();
        setManualDraft(createManualReadingDraft());
        setManualError("");
        afterLeave?.();
        navigate(target);
      },
    });
  };
  const changeHold = (item: ReadingItem) => {
    const label = item.status === "published" ? "보류로 전환" : item.status === "held" ? "보류 취소" : "보류";
    openDialog({
      kicker: "Change item state",
      title: `${label}할까요?`,
      description: item.status === "published" ? "전환하면 학습자 목록에서 이 문항을 볼 수 없습니다." : "문항의 공개 상태를 변경합니다.",
      confirmLabel: label,
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            const next = item.status === "held" ? await api.unhold(item.id) : await api.hold(item.id);
            replaceAdminItem(next);
            setDraft((current) => (current?.id === next.id ? structuredClone(next) : current));
            await Promise.all([loadPublicItems(), loadStatistics()]);
            setToast(item.status === "held" ? "문항 보류를 취소했습니다." : "문항을 보류했습니다.");
          } catch (error) {
            setToast(error instanceof Error ? error.message : "상태를 변경하지 못했습니다.");
          }
        })();
      },
    });
  };
  const publishItem = (item: ReadingItem) =>
    openDialog({
      kicker: "Publish item",
      title: "문항을 게시할까요?",
      description: "게시한 문항은 학습자 목록에서 바로 풀이할 수 있습니다.",
      confirmLabel: "게시하기",
      onConfirm: () => {
        if (adminSavingRef.current) return;
        adminSavingRef.current = true;
        setIsAdminSaving(true);
        closeDialog();
        void (async () => {
          try {
            const saved = await api.updateAdminReading(item);
            replaceAdminItem(saved);
            setDraft(structuredClone(saved));
            const next = await api.publish(saved.id);
            replaceAdminItem(next);
            setDraft((current) => (current?.id === next.id ? structuredClone(next) : current));
            await Promise.all([loadPublicItems(), loadStatistics()]);
            setDraft(null);
            navigate("/admin/readings/new");
            setToast("문항을 게시했습니다.");
          } catch (error) {
            setToast(error instanceof Error ? error.message : "문항을 게시하지 못했습니다.");
          } finally {
            adminSavingRef.current = false;
            setIsAdminSaving(false);
          }
        })();
      },
    });

  const continueReading = () => {
    if (!result) return navigate("/");
    const current = result.isCorrect
      ? items[(items.findIndex((item) => item.id === result.item.id) + 1) % items.length]
      : result.item;
    if (current) start(current);
  };
  const isEditing = screen === "admin-edit" || screen === "manual-create";
  const leaveCurrentEditor = (
    target: string,
    targetLabel: string,
    afterLeave?: () => void,
  ) =>
    screen === "manual-create"
      ? leaveManualCreate(target, targetLabel, afterLeave)
      : leaveEditor(target, targetLabel, afterLeave);
  const goHomeFromHeader = () =>
    isEditing ? leaveCurrentEditor("/", "독해 목록") : goHome();
  const openAdminFromHeader = () => {
    if (!adminLoaded) void loadAdminItems().catch(() => setToast("관리 목록을 불러오지 못했습니다."));
    isEditing
      ? leaveCurrentEditor("/admin/readings", "문항 관리 화면")
      : abandonAndNavigate("/admin/readings", "관리자 화면");
  };
  const openStatsFromHeader = () =>
    isEditing
      ? leaveCurrentEditor("/statistics", "학습 통계 화면")
      : abandonAndNavigate("/statistics", "학습 통계 화면");
  const logoutFromHeader = () =>
    isEditing ? leaveCurrentEditor("/", "로그아웃 후 독해 목록", logout) : logout();

  return (
    <main className="app" data-screen={screen} data-role={role} data-authenticated={authenticated}>
      <div className="shell">
        <AppHeader
          authenticated={authenticated}
          role={role}
          totalGenerated={totalGenerated}
          completeCount={completeCount}
          progressLanguage={filters.language}
          onHome={goHomeFromHeader}
          onOpenAdmin={openAdminFromHeader}
          onOpenStats={openStatsFromHeader}
          onLogout={logoutFromHeader}
        />
        {screen !== "login" && authenticated ? (
          <Breadcrumb screen={screen} />
        ) : null}
        {authLoading ? <p role="status">{t("common.loading")}</p> : <Routes>
          <Route
            path="/login"
            element={
              authenticated ? (
                <Navigate to="/" replace />
              ) : (
                <LoginScreen
                  clientId={googleClientId}
                  error={dialogError}
                  onCredential={completeGoogleLogin}
                  onError={setDialogError}
                  onBack={() => {
                    setPendingStart(null);
                    setDialogError("");
                    navigate("/");
                  }}
                />
              )
            }
          />
          <Route
            path="/"
            element={
              authenticated ? (
                <ReadingListScreen items={items} loading={isListLoading} error={listError} page={listPage} totalPages={listTotalPages} totalItems={listTotalItems} onPageChange={setListPage} authenticated={authenticated} filters={filters} setFilters={setListFilters} query={query} setQuery={setListQuery} onOpenFilters={openListFilters} onOpenHighlights={openHighlightCollection} onOpenScoreGuide={openScoreGuide} onStart={start} bookmarkingItemIds={bookmarkingItemIds} onToggleBookmark={(item) => void toggleBookmark(item)} />
              ) : (
                <WelcomeScreen onLogin={openLogin} />
              )
            }
          />
          <Route path="/readings/:itemId" element={<RequireAuth authenticated={authenticated}><ReadingRoute items={items} attempt={attempt} result={result} onChoose={(questionId, choiceId) => setAttempt((current) => current ? { ...current, selectedChoiceId: current.questions[0]?.id === questionId ? choiceId : current.selectedChoiceId, answers: current.answers.map((answer) => answer.questionId === questionId ? { ...answer, selectedChoiceId: choiceId } : answer), message: "" } : current)} onSubmit={submit} isSubmitting={isSubmitting} onAbandon={goHome} onReport={openReport} onTranslate={openTranslation} onResult={() => result && navigate(`/results/${result.itemId}`)} highlights={attempt ? passageHighlights[attempt.itemId] ?? [] : []} onCreateHighlight={(startOffset, endOffset, selectedText) => attempt ? createPassageHighlight(attempt.itemId, startOffset, endOffset, selectedText) : Promise.reject(new Error(t("reading.noActiveAttempt")))} onDeleteHighlight={(highlightId) => attempt ? deletePassageHighlight(attempt.itemId, highlightId) : Promise.reject(new Error(t("reading.noActiveAttempt")))} /></RequireAuth>} />
          <Route path="/results/:itemId" element={<RequireAuth authenticated={authenticated}><ResultRoute result={result} onFeedback={openFeedback} onReview={() => result && navigate(`/readings/${result.itemId}`)} onContinue={continueReading} onHome={goHome} /></RequireAuth>} />
          <Route path="/statistics" element={<RequireAuth authenticated={authenticated}><StatsScreen statistics={statistics} /></RequireAuth>} />
          <Route path="/admin/readings" element={<RequireAdmin authenticated={authenticated} role={role}><AdminScreen items={adminItems} loading={isAdminListLoading} error={adminListError} page={adminPage} totalPages={adminTotalPages} totalItems={adminTotalItems} onPageChange={setAdminPage} filters={adminFilters} query={adminQuery} setQuery={(nextQuery) => { setAdminPage(1); setAdminQuery(nextQuery); }} onLanguageChange={(language) => updateAdminFilters((current) => ({ ...current, language, level: "all" }))} onFilters={openAdminFilters} onEdit={openEdit} onGenerate={() => { void loadGenerationModels(); navigate("/admin/readings/new"); }} onManualCreate={() => { setManualDraft(createManualReadingDraft()); setManualError(""); navigate("/admin/readings/manual"); }} onHistory={() => { void loadGenerationHistory(); navigate("/admin/generation-history"); }} /></RequireAdmin>} />
          <Route path="/admin/generation-history" element={<RequireAdmin authenticated={authenticated} role={role}><GenerationHistoryScreen items={generationHistory} loading={isGenerationHistoryLoading} error={generationHistoryError} page={generationHistoryPage} totalPages={generationHistoryTotalPages} totalItems={generationHistoryTotalItems} onPageChange={(page) => void loadGenerationHistory(page)} onRefresh={() => void loadGenerationHistory(generationHistoryPage)} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="/admin/readings/manual" element={<RequireAdmin authenticated={authenticated} role={role}><ManualCreateScreen values={manualDraft} setValues={setManualDraft} isSaving={isManualSaving} error={manualError} onSave={() => void createManualReading()} onBack={leaveManualCreate} onSuggestTitle={async (passage, language) => (await api.suggestAdminTitle(passage, language)).title} onSuggestTopic={async (passage, language) => (await api.suggestAdminTopic(passage, language)).topic} onSuggestExplanation={async (passage, question, choices, language) => (await api.suggestAdminExplanation(passage, question, choices, language)).explanation} onConfirmQuestionTruncation={confirmQuestionTruncation} /></RequireAdmin>} />
          <Route path="/admin/readings/new" element={<RequireAdmin authenticated={authenticated} role={role}><GenerateScreen values={generation} setValues={setGeneration} modelOptions={generationModels} modelError={generationModelsError} isCreating={isGenerating} progressLabel={generationProgress} error={generationJob.error} onCreate={createDraft} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/edit" element={<RequireAdmin authenticated={authenticated} role={role}><AdminEditRoute items={adminItems} draft={draft} setDraft={setDraft} onSave={() => draft && void updateAdminItem(draft)} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={leaveEditor} isSaving={isAdminSaving} onConfirmQuestionTruncation={confirmQuestionTruncation} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/preview" element={<RequireAdmin authenticated={authenticated} role={role}><PreviewRoute items={adminItems} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>}
      </div>
      {screen === "stats" ? (
        <nav className="scroll-controls" aria-label="통계 페이지 이동">
          <button className="scroll-control-button" type="button" aria-label="통계 맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon icon={ChevronUp} /></button>
          <button className="scroll-control-button" type="button" aria-label="통계 맨 아래로" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}><Icon icon={ChevronDown} /></button>
        </nav>
      ) : null}
      <Dialog dialog={dialog} onClose={closeDialog}>
        <AppDialogContent type={dialog?.type} authenticated={authenticated} filterDraft={filterDraft} setFilterDraft={setFilterDraft} adminFilterDraft={adminFilterDraft} setAdminFilterDraft={setAdminFilterDraft} reportText={reportText} setReportText={setReportText} feedback={feedback} feedbackLanguage={result?.item.language ?? defaultGenerationLanguage} setFeedback={setFeedback} dialogError={dialogError} translation={translation} translationLoading={translationLoading} translationError={translationError} highlightCollection={highlightCollection} highlightLanguage={highlightLanguage} highlightQuery={highlightQuery} onHighlightLanguageChange={(language) => { setHighlightLanguage(language); void loadHighlightCollection({ language, page: 1 }); }} onHighlightQueryChange={setHighlightQuery} onHighlightSearch={() => void loadHighlightCollection({ page: 1 })} onHighlightPageChange={(page) => void loadHighlightCollection({ page })} highlightsLoading={isHighlightCollectionLoading} highlightsError={highlightCollectionError} removingHighlightId={removingHighlightId} highlightRemoval={highlightRemoval} onCancelHighlightRemoval={() => setHighlightRemoval(null)} onConfirmHighlightRemoval={() => { if (!highlightRemoval) return; setHighlightRemoval(null); void removeHighlightFromCollection(highlightRemoval.readingItemId, highlightRemoval.highlightId); }} onRemoveHighlight={confirmHighlightRemoval} />
      </Dialog>
      {toast ? <div className="toast is-visible" role="status">{toast}</div> : null}
    </main>
  );
}
