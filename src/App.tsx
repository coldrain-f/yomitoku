import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  GenerationHistoryScreen,
  AdminScreen,
  GenerateScreen,
  ManualCreateScreen,
} from "./features/admin/AdminScreens";
import { AdminEditRoute } from "./features/admin/AdminEditRoute";
import { AdminPreviewRoute } from "./features/admin/AdminPreviewRoute";
import { ReadingListScreen } from "./features/readings/ReadingScreens";
import { ReadingRoute, ResultRoute } from "./features/readings/ReadingRoutes";
import {
  useHighlightCollection,
} from "./features/readings/useHighlightCollection";
import { useReadingAttempt } from "./features/readings/useReadingAttempt";
import { useReadingList } from "./features/readings/useReadingList";
import { useReadingSubmission } from "./features/readings/useReadingSubmission";
import { StatsScreen } from "./features/statistics/StatsScreen";
import { LoginScreen } from "./features/auth/LoginScreen";
import { WelcomeScreen } from "./features/auth/WelcomeScreen";
import { useAuth } from "./features/auth/useAuth";
import { useGenerationJob } from "./features/admin/useGenerationJob";
import {
  useAdminReadingList,
  useGenerationResources,
} from "./features/admin/useAdminResources";
import { useAdminReadingActions } from "./features/admin/useAdminReadingActions";
import { AppDialogContent } from "./components/AppDialogContent";
import { AppHeader } from "./components/AppHeader";
import { Breadcrumb } from "./components/ui/Breadcrumb";
import { Dialog } from "./components/ui/Dialog";
import { Icon } from "./components/ui/Icon";
import {
  api,
  recordFromResult,
  type GenerationJob,
  type ReadingTranslation,
  type Statistics,
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
  DialogConfig,
  FeedbackValues,
  GenerationValues,
  HighlightRemovalConfirmation,
  ListFilters,
  ManualReadingDraft,
  PassageHighlight,
  ReadingItem,
  ReadingLanguage,
  Role,
  Screen,
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

function generationProgressLabel(job: GenerationJob, t: (key: string) => string) {
  if (job.status === "queued") return t("admin.progressQueued");
  if (job.currentNode === "generate") return t("admin.progressGenerate");
  if (job.currentNode === "validate_schema") return t("admin.progressValidateSchema");
  if (job.currentNode === "verify_answer") return t("admin.progressVerifyAnswer");
  if (job.currentNode === "verify_quality") return t("admin.progressVerifyQuality");
  if (job.currentNode === "revise") return t("admin.progressRevise");
  if (job.currentNode === "retry_generate") return t("admin.progressRetry");
  return t("admin.progressFinalizing");
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

function validateManualReadingDraft(
  values: ManualReadingDraft,
  t: (key: string) => string,
) {
  if (
    !values.title.trim() ||
    !values.passage.trim() ||
    values.questions.some((question) => !question.question.trim())
  ) {
    return t("admin.manualMissingBasics");
  }
  const maximum =
    values.lengthType === "short" ? 1 : values.lengthType === "medium" ? 3 : 4;
  if (values.questions.length > maximum) return t("admin.manualQuestionLimit");
  for (const question of values.questions) {
    const choices = question.choices.map((choice) => choice.text.trim());
    if (choices.some((choice) => !choice)) {
      return t("admin.manualChoicesRequired");
    }
    if (new Set(choices).size !== choices.length) {
      return t("admin.manualChoicesUnique");
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

export default function App() {
  const { t, levelLabel, lengthLabel, topicLabel, errorMessage } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen = screenForPath(location.pathname);
  const {
    authenticated,
    authLoading,
    initialAuthError,
    role,
    signInWithGoogle,
    signOut,
    userId,
  } = useAuth();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [passageHighlights, setPassageHighlights] = useState<
    Record<string, PassageHighlight[]>
  >({});
  const [highlightRemoval, setHighlightRemoval] =
    useState<HighlightRemovalConfirmation | null>(null);
  const [bookmarkingItemIds, setBookmarkingItemIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const {
    collection: highlightCollection,
    error: highlightCollectionError,
    isLoading: isHighlightCollectionLoading,
    language: highlightLanguage,
    load: loadHighlightCollection,
    open: openHighlightCollectionData,
    query: highlightQuery,
    remove: removeHighlight,
    removingHighlightId,
    reset: resetHighlightCollection,
    setLanguage: setHighlightLanguage,
    setQuery: setHighlightQuery,
  } = useHighlightCollection(errorMessage);
  const {
    error: listError,
    isLoading: isListLoading,
    items,
    load: loadPublicItems,
    page: listPage,
    setItems,
    setPage: setListPage,
    totalItems: listTotalItems,
    totalPages: listTotalPages,
  } = useReadingList({
    authenticated,
    enabled: !authLoading,
    errorMessage,
    filters,
    pageSize: listPageSize,
    query,
  });
  const [filterDraft, setFilterDraft] = useState(filters);
  const filterDraftRef = useRef(filterDraft);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [pendingStart, setPendingStart] = useState<ReadingItem | null>(null);
  const [toast, setToast] = useState("");
  const [translation, setTranslation] = useState<ReadingTranslation | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [generation, setGeneration] = useState<GenerationValues>({
    language: defaultGenerationLanguage,
    level: defaultGenerationLevelByLanguage[defaultGenerationLanguage],
    length: defaultGenerationLength,
    topic: recommendedTopic,
    keywords: [],
    generatorModel: "",
    validatorModel: "",
  });
  const {
    error: adminListError,
    filters: adminFilters,
    isLoading: isAdminListLoading,
    items: adminItems,
    loaded: adminLoaded,
    page: adminPage,
    query: adminQuery,
    replaceItem: replaceAdminItem,
    setFilters: setAdminFilters,
    setItems: setAdminItems,
    setPage: setAdminPage,
    setQuery: setAdminQuery,
    totalItems: adminTotalItems,
    totalPages: adminTotalPages,
    load: loadAdminItems,
  } = useAdminReadingList({
    enabled: authenticated && role === "admin",
    defaultFilters: defaultAdminFilters,
    errorMessage,
    normalizeFilters: (stored) => ({
      ...stored,
      language: normalizeReadingLanguage(stored.language),
    }),
    pageSize: listPageSize,
    storageKey: adminFiltersStorageKey,
  });
  const {
    deleteAdminItem,
    draft,
    isAdminSaving,
    isManualSaving,
    manualDraft,
    manualError,
    openAdminItem,
    publishAdminItem,
    resetManualDraft,
    saveAdminItem,
    saveManualReading,
    setDraft,
    setManualDraft,
    suggestExplanation,
    suggestTitle,
    suggestTopic,
    toggleHold,
  } = useAdminReadingActions({
    createManualDraft: createManualReadingDraft,
    errorMessage,
    removeAdminItem: (itemId) =>
      setAdminItems((current) => current.filter((item) => item.id !== itemId)),
    replaceAdminItem,
    validateManualDraft: (item) => validateManualReadingDraft(item, t),
  });
  const [adminFilterDraft, setAdminFilterDraft] = useState(adminFilters);
  const adminFilterDraftRef = useRef(adminFilterDraft);
  const {
    history: generationHistory,
    historyError: generationHistoryError,
    historyPage: generationHistoryPage,
    historyTotalItems: generationHistoryTotalItems,
    historyTotalPages: generationHistoryTotalPages,
    isHistoryLoading: isGenerationHistoryLoading,
    loadHistory: loadGenerationHistory,
    loadModels: loadGenerationModels,
    models: generationModels,
    modelsError: generationModelsError,
  } = useGenerationResources({ errorMessage, setGeneration });
  const [dialogError, setDialogError] = useState("");
  const generationJob = useGenerationJob(authenticated && role === "admin" ? userId : null);
  const isGenerating = generationJob.isPending || Boolean(generationJob.job?.generatedItemId);
  const generationProgress = generationJob.job
    ? generationProgressLabel(generationJob.job, t) : t("admin.progressExisting");
  const [reportText, setReportText] = useState("");
  const reportTextRef = useRef(reportText);
  const [feedback, setFeedback] = useState<FeedbackValues>({
    quality: "",
    level: "",
    comment: "",
  });
  const feedbackRef = useRef(feedback);

  const languageStatistics = statistics?.byLanguage?.find(
    (group) => group.key === filters.language,
  );
  const completeCount =
    languageStatistics?.completedCount ?? statistics?.completedCount ?? 0;
  const totalGenerated =
    languageStatistics?.totalCount ?? statistics?.totalGeneratedCount ?? 0;

  const loadStatistics = async () => setStatistics(await api.statistics());
  const loadPassageHighlights = useCallback(async (itemId: string) => {
    const highlights = await api.highlights(itemId);
    setPassageHighlights((current) => ({ ...current, [itemId]: highlights }));
  }, []);
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
    if (!(await removeHighlight(itemId, highlightId))) return;
    setPassageHighlights((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).filter(
        (highlight) => highlight.id !== highlightId,
      ),
    }));
    setToast(t("highlights.removeSuccess"));
  };
  const recordRestoredSubmission = useCallback(
    (item: ReadingItem, submitted: Parameters<typeof recordFromResult>[1]) => {
      setAttempts((current) => [
        ...current.filter((entry) => entry.itemId !== item.id),
        recordFromResult(item, submitted),
      ]);
    },
    [],
  );
  const {
    isSubmitting,
    resetSubmission,
    result,
    restoreSubmission,
    submitReadingAttempt,
    submittingRef,
  } = useReadingSubmission();
  const restoreAttemptSubmission = useCallback(
    (
      item: ReadingItem,
      itemId: string,
      submitted: Parameters<typeof restoreSubmission>[2],
    ) => {
      restoreSubmission(item, itemId, submitted);
      if (submitted) recordRestoredSubmission(item, submitted);
    },
    [recordRestoredSubmission, restoreSubmission],
  );
  const {
    abandonCurrentAttempt,
    attempt,
    chooseAnswer,
    clearStoredSession,
    resetSession,
    setAttempt,
    startAttempt,
  } = useReadingAttempt({
    authenticated,
    authLoading,
    isReading: screen === "reading",
    userId,
    pathname: location.pathname,
    setItems,
    loadPassageHighlights,
    onAttemptStarted: resetSubmission,
    onAttemptRestored: restoreAttemptSubmission,
  });
  const activeItem = items.find((item) => item.id === attempt?.itemId);

  useEffect(() => {
    if (!initialAuthError) return;
    setToast(errorMessage(initialAuthError, "common.serverConnectionFailed"));
  }, [initialAuthError]);

  useEffect(() => {
    if (!authenticated) return;
    void loadStatistics().catch((error: unknown) =>
      setToast(errorMessage(error, "stats.failed")),
    );
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || role !== "admin") return;
    void loadGenerationModels();
  }, [authenticated, role]);

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
          setToast(t("admin.generatedReloading"));
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
    reportTextRef.current = reportText;
  }, [reportText]);
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);
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
      kicker: t("admin.changeTypeKicker"),
      title: t("admin.changeTypeTitle"),
      description: t("admin.changeTypeDescription", { count: removedQuestionCount }),
      confirmLabel: t("admin.changeTypeConfirm"),
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
            await startAttempt(item);
            navigate(`/readings/${item.id}`);
          } catch (error) {
            setToast(errorMessage(error, "start.openFailed"));
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
        abandonCurrentAttempt();
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
    openDialog({
      kicker: t("submit.kicker"),
      title: t("submit.title"),
      description: t("submit.description"),
      confirmLabel: t("submit.confirm"),
      onConfirm: () => {
        if (submittingRef.current) return;
        closeDialog();
        void (async () => {
          try {
            const submitted = await submitReadingAttempt(attempt, activeItem);
            if (!submitted) return;
            setAttempt({ ...attempt, submitted: true, elapsedSeconds: submitted.elapsedSeconds });
            setAttempts((current) => [...current, recordFromResult(activeItem, submitted)]);
            await Promise.all([loadStatistics(), loadPublicItems()]);
          } catch (error) {
            setToast(errorMessage(error, "submit.failed"));
          }
        })();
      },
    });
  };

  const deleteItem = (item: ReadingItem, target = "/admin/readings") =>
    openDialog({
      kicker: t("admin.deleteKicker"),
      title: t("admin.deleteTitle"),
      description: t("admin.deleteDescription"),
      confirmLabel: t("admin.deleteConfirm"),
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            await deleteAdminItem(item.id);
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            setAttempts((current) => current.filter((entry) => entry.itemId !== item.id));
            await loadStatistics();
            navigate(target);
            setToast(t("admin.deleted"));
          } catch (error) {
            setToast(errorMessage(error, "admin.deleteFailed"));
          }
        })();
      },
    });

  const createDraft = () =>
    openDialog({
      kicker: t("admin.generateKicker"),
      title: t("admin.generateTitle"),
      description: t("admin.generateDescription"),
      confirmLabel: t("admin.generateConfirm"),
      onConfirm: () => {
        closeDialog();
        if (!generation.generatorModel || !generation.validatorModel) {
          setToast(t("admin.modelsRequired"));
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
  const openHighlightCollection = () => {
    if (!authenticated) {
      openLogin();
      return;
    }
    setHighlightRemoval(null);
    showHighlightCollectionDialog();
    void openHighlightCollectionData();
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
      kicker: t("admin.filterKicker"),
      title: t("admin.filterTitle"),
      description: t("admin.filterDescription"),
      confirmLabel: t("admin.filterApply"),
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
          .catch((error: unknown) => setToast(errorMessage(error, "report.failed")));
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
        setTranslationError(errorMessage(error, "translation.failed")),
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
          .catch((error: unknown) => setToast(errorMessage(error, "feedback.failed")));
      },
    });
  };

  const completeGoogleLogin = (credential: string) => {
    const itemToStart = pendingStart;
    void (async () => {
    try {
      const user = await signInWithGoogle(credential);
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
      setDialogError(errorMessage(error, "auth.failed"));
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
      setToast(errorMessage(error, "bookmark.failed"));
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
    signOut();
    clearStoredSession();
    resetSession();
    resetSubmission();
    setStatistics(null);
    setPassageHighlights({});
    resetHighlightCollection();
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
        const detail = await openAdminItem(item.id);
        navigate(`/admin/readings/${detail.id}/edit`);
      } catch (error) {
        setToast(errorMessage(error, "admin.openFailed"));
      }
    })();
  };
  const leaveEditor = (
    target = "/admin/readings",
    targetLabel = t("admin.management"),
    afterLeave?: () => void,
  ) => {
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
      kicker: changed ? t("admin.discardChangesKicker") : t("admin.leaveEditorKicker"),
      title: changed
        ? t("admin.discardChangesTitle")
        : t("admin.leaveEditorTitle", { target: targetLabel }),
      description: changed
        ? t("admin.discardChangesDescription", { target: targetLabel })
        : t("admin.leaveEditorDescription", { target: targetLabel }),
      confirmLabel: changed
        ? t("admin.discardChangesConfirm")
        : t("admin.leaveEditorConfirm"),
      onConfirm: () => {
        closeDialog();
        setDraft(null);
        afterLeave?.();
        navigate(target);
      },
    });
  };
  const updateAdminItem = async (item: ReadingItem) => {
    try {
      const next = await saveAdminItem(item);
      if (!next) return;
      setToast(t("admin.savedChanges"));
    } catch (error) {
      setToast(errorMessage(error, "admin.saveFailed"));
    }
  };
  const createManualReading = async () => {
    try {
      const next = await saveManualReading();
      if (!next) return;
      navigate("/admin/readings/" + next.id + "/edit");
      setToast(t("admin.manualSaved"));
    } catch (error) {
      setToast(errorMessage(error, "admin.saveFailed"));
    }
  };
  const leaveManualCreate = (
    target = "/admin/readings",
    targetLabel = t("admin.management"),
    afterLeave?: () => void,
  ) => {
    const hasContent =
      Boolean(manualDraft.title.trim()) ||
      Boolean(manualDraft.passage.trim()) ||
      Boolean(manualDraft.question.trim()) ||
      Boolean(manualDraft.explanation.trim()) ||
      manualDraft.choices.some((choice) => Boolean(choice.text.trim()));
    if (!hasContent) {
      resetManualDraft();
      afterLeave?.();
      navigate(target);
      return;
    }
    openDialog({
      kicker: t("admin.discardDraftKicker"),
      title: t("admin.discardDraftTitle"),
      description: t("admin.discardDraftDescription", { target: targetLabel }),
      confirmLabel: t("admin.discardDraftConfirm"),
      onConfirm: () => {
        closeDialog();
        resetManualDraft();
        afterLeave?.();
        navigate(target);
      },
    });
  };
  const changeHold = (item: ReadingItem) => {
    const isPublished = item.status === "published";
    const isHeld = item.status === "held";
    const label = isPublished
      ? t("admin.holdTransition")
      : isHeld
        ? t("admin.cancelHold")
        : t("admin.holdConfirm");
    openDialog({
      kicker: t("admin.changeStateKicker"),
      title: isPublished
        ? t("admin.holdTransitionTitle")
        : isHeld
          ? t("admin.holdCancelTitle")
          : t("admin.holdTitle"),
      description: isPublished
        ? t("admin.holdPublishedDescription")
        : t("admin.changeStateDescription"),
      confirmLabel: label,
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            await toggleHold(item);
            await Promise.all([loadPublicItems(), loadStatistics()]);
            setToast(isHeld ? t("admin.holdCancelled") : t("admin.held"));
          } catch (error) {
            setToast(errorMessage(error, "admin.changeStateFailed"));
          }
        })();
      },
    });
  };
  const publishItem = (item: ReadingItem) =>
    openDialog({
      kicker: t("admin.publishKicker"),
      title: t("admin.publishTitle"),
      description: t("admin.publishDescription"),
      confirmLabel: t("admin.publish"),
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            const next = await publishAdminItem(item);
            if (!next) return;
            await Promise.all([loadPublicItems(), loadStatistics()]);
            setDraft(null);
            navigate("/admin/readings/new");
            setToast(t("admin.published"));
          } catch (error) {
            setToast(errorMessage(error, "admin.publishFailed"));
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
    isEditing ? leaveCurrentEditor("/", t("admin.readingListTarget")) : goHome();
  const openAdminFromHeader = () => {
    if (!adminLoaded) {
      void loadAdminItems().catch(() => setToast(t("admin.listLoadFailed")));
    }
    isEditing
      ? leaveCurrentEditor("/admin/readings", t("admin.managementScreen"))
      : abandonAndNavigate("/admin/readings", t("admin.screen"));
  };
  const openStatsFromHeader = () =>
    isEditing
      ? leaveCurrentEditor("/statistics", t("stats.title"))
      : abandonAndNavigate("/statistics", t("stats.title"));
  const logoutFromHeader = () =>
    isEditing ? leaveCurrentEditor("/", t("admin.logoutListTarget"), logout) : logout();

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
          <Route path="/readings/:itemId" element={<RequireAuth authenticated={authenticated}><ReadingRoute items={items} attempt={attempt} result={result} onChoose={chooseAnswer} onSubmit={submit} isSubmitting={isSubmitting} onAbandon={goHome} onReport={openReport} onTranslate={openTranslation} onResult={() => result && navigate(`/results/${result.itemId}`)} highlights={attempt ? passageHighlights[attempt.itemId] ?? [] : []} onCreateHighlight={(startOffset, endOffset, selectedText) => attempt ? createPassageHighlight(attempt.itemId, startOffset, endOffset, selectedText) : Promise.reject(new Error(t("reading.noActiveAttempt")))} onDeleteHighlight={(highlightId) => attempt ? deletePassageHighlight(attempt.itemId, highlightId) : Promise.reject(new Error(t("reading.noActiveAttempt")))} /></RequireAuth>} />
          <Route path="/results/:itemId" element={<RequireAuth authenticated={authenticated}><ResultRoute result={result} onFeedback={openFeedback} onReview={() => result && navigate(`/readings/${result.itemId}`)} onContinue={continueReading} onHome={goHome} /></RequireAuth>} />
          <Route path="/statistics" element={<RequireAuth authenticated={authenticated}><StatsScreen statistics={statistics} /></RequireAuth>} />
          <Route path="/admin/readings" element={<RequireAdmin authenticated={authenticated} role={role}><AdminScreen items={adminItems} loading={isAdminListLoading} error={adminListError} page={adminPage} totalPages={adminTotalPages} totalItems={adminTotalItems} onPageChange={setAdminPage} filters={adminFilters} query={adminQuery} setQuery={(nextQuery) => { setAdminPage(1); setAdminQuery(nextQuery); }} onLanguageChange={(language) => updateAdminFilters((current) => ({ ...current, language, level: "all" }))} onFilters={openAdminFilters} onEdit={openEdit} onGenerate={() => { void loadGenerationModels(); navigate("/admin/readings/new"); }} onManualCreate={() => { resetManualDraft(); navigate("/admin/readings/manual"); }} onHistory={() => { void loadGenerationHistory(); navigate("/admin/generation-history"); }} /></RequireAdmin>} />
          <Route path="/admin/generation-history" element={<RequireAdmin authenticated={authenticated} role={role}><GenerationHistoryScreen items={generationHistory} loading={isGenerationHistoryLoading} error={generationHistoryError} page={generationHistoryPage} totalPages={generationHistoryTotalPages} totalItems={generationHistoryTotalItems} onPageChange={(page) => void loadGenerationHistory(page)} onRefresh={() => void loadGenerationHistory(generationHistoryPage)} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="/admin/readings/manual" element={<RequireAdmin authenticated={authenticated} role={role}><ManualCreateScreen values={manualDraft} setValues={setManualDraft} isSaving={isManualSaving} error={manualError} onSave={() => void createManualReading()} onBack={leaveManualCreate} onSuggestTitle={suggestTitle} onSuggestTopic={suggestTopic} onSuggestExplanation={suggestExplanation} onConfirmQuestionTruncation={confirmQuestionTruncation} /></RequireAdmin>} />
          <Route path="/admin/readings/new" element={<RequireAdmin authenticated={authenticated} role={role}><GenerateScreen values={generation} setValues={setGeneration} modelOptions={generationModels} modelError={generationModelsError} isCreating={isGenerating} progressLabel={generationProgress} error={generationJob.error} onCreate={createDraft} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/edit" element={<RequireAdmin authenticated={authenticated} role={role}><AdminEditRoute items={adminItems} draft={draft} setDraft={setDraft} onSave={() => draft && void updateAdminItem(draft)} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={leaveEditor} isSaving={isAdminSaving} onConfirmQuestionTruncation={confirmQuestionTruncation} onSuggestTitleRequest={suggestTitle} onSuggestTopicRequest={suggestTopic} onSuggestExplanationRequest={suggestExplanation} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/preview" element={<RequireAdmin authenticated={authenticated} role={role}><AdminPreviewRoute items={adminItems} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>}
      </div>
      {screen === "stats" ? (
        <nav className="scroll-controls" aria-label={t("stats.scrollNavigation")}>
          <button className="scroll-control-button" type="button" aria-label={t("stats.scrollTop")} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon icon={ChevronUp} /></button>
          <button className="scroll-control-button" type="button" aria-label={t("stats.scrollBottom")} onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}><Icon icon={ChevronDown} /></button>
        </nav>
      ) : null}
      <Dialog dialog={dialog} onClose={closeDialog}>
        <AppDialogContent type={dialog?.type} authenticated={authenticated} filterDraft={filterDraft} setFilterDraft={setFilterDraft} adminFilterDraft={adminFilterDraft} setAdminFilterDraft={setAdminFilterDraft} reportText={reportText} setReportText={setReportText} feedback={feedback} feedbackLanguage={result?.item.language ?? defaultGenerationLanguage} setFeedback={setFeedback} dialogError={dialogError} translation={translation} translationLoading={translationLoading} translationError={translationError} highlightCollection={highlightCollection} highlightLanguage={highlightLanguage} highlightQuery={highlightQuery} onHighlightLanguageChange={(language) => { setHighlightLanguage(language); void loadHighlightCollection({ language, page: 1 }); }} onHighlightQueryChange={setHighlightQuery} onHighlightSearch={() => void loadHighlightCollection({ page: 1 })} onHighlightPageChange={(page) => void loadHighlightCollection({ page })} highlightsLoading={isHighlightCollectionLoading} highlightsError={highlightCollectionError} removingHighlightId={removingHighlightId} highlightRemoval={highlightRemoval} onCancelHighlightRemoval={() => setHighlightRemoval(null)} onConfirmHighlightRemoval={() => { if (!highlightRemoval) return; setHighlightRemoval(null); void removeHighlightFromCollection(highlightRemoval.readingItemId, highlightRemoval.highlightId); }} onRemoveHighlight={confirmHighlightRemoval} />
      </Dialog>
      {toast ? <div className="toast is-visible" role="status">{toast}</div> : null}
    </main>
  );
}
