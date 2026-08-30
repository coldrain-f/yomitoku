import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  AdminScreen,
  GenerateScreen,
  PreviewScreen,
} from "./features/admin/AdminScreens";
import {
  ReadingListScreen,
  ReadingScreen,
  ResultScreen,
} from "./features/readings/ReadingScreens";
import { StatsScreen } from "./features/statistics/StatsScreen";
import { AppDialogContent } from "./components/AppDialogContent";
import { AppHeader } from "./components/AppHeader";
import { Breadcrumb } from "./components/ui/Breadcrumb";
import { Dialog } from "./components/ui/Dialog";
import { Icon } from "./components/ui/Icon";
import { initialItems } from "./data";
import {
  latestAttempts,
  shuffle,
  totalGeneratedInitial,
} from "./lib/reading";
import { defaultRecommendedSeconds } from "./data";
import type {
  AdminFilters,
  AttemptRecord,
  DialogConfig,
  FeedbackValues,
  GenerationValues,
  ListFilters,
  ReadingAttempt,
  ReadingItem,
  ReadingResult,
  Role,
  Screen,
  StateSetter,
  Topic,
} from "./types";

const defaultListFilters: ListFilters = {
  level: "all",
  length: "all",
  status: "all",
  sort: "published-desc",
};

function screenForPath(pathname: string): Screen {
  if (pathname === "/statistics") return "stats";
  if (pathname.startsWith("/results/")) return "result";
  if (pathname.startsWith("/readings/")) return "reading";
  if (pathname === "/admin/readings") return "admin";
  if (pathname === "/admin/readings/new") return "generate";
  if (pathname.endsWith("/preview")) return "preview";
  if (pathname.endsWith("/edit")) return "admin-edit";
  return "home";
}

interface RequireAuthProps {
  authenticated: boolean;
  children: ReactNode;
}

function RequireAuth({ authenticated, children }: RequireAuthProps) {
  return authenticated ? children : <Navigate to="/" replace />;
}

interface RequireAdminProps extends RequireAuthProps {
  role: Role;
}

function RequireAdmin({ authenticated, role, children }: RequireAdminProps) {
  return authenticated && role === "admin" ? children : <Navigate to="/" replace />;
}

interface ReadingRouteProps {
  items: ReadingItem[];
  attempt: ReadingAttempt | null;
  result: ReadingResult | null;
  onChoose: (choiceId: string) => void;
  onSubmit: () => void;
  onAbandon: () => void;
  onReport: () => void;
  onResult: () => void;
}

function ReadingRoute({
  items,
  attempt,
  result,
  ...screenProps
}: ReadingRouteProps) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);

  if (!item || attempt?.itemId !== item.id) {
    return <Navigate to="/" replace />;
  }

  return <ReadingScreen item={item} attempt={attempt} result={result} {...screenProps} />;
}

interface ResultRouteProps {
  result: ReadingResult | null;
  onFeedback: () => void;
  onContinue: () => void;
  onHome: () => void;
}

function ResultRoute({ result, ...screenProps }: ResultRouteProps) {
  const { itemId } = useParams();

  if (!result || result.itemId !== itemId) {
    return <Navigate to="/" replace />;
  }

  return <ResultScreen result={result} {...screenProps} />;
}

interface AdminEditRouteProps {
  items: ReadingItem[];
  draft: ReadingItem | null;
  setDraft: StateSetter<ReadingItem | null>;
  onSave: (item: ReadingItem) => void;
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
}

function AdminEditRoute({
  items,
  draft,
  setDraft,
  ...screenProps
}: AdminEditRouteProps) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);

  useEffect(() => {
    if (item && (!draft || draft.id !== item.id)) {
      setDraft(structuredClone(item));
    }
  }, [draft?.id, item, setDraft]);

  if (!item) {
    return <Navigate to="/admin/readings" replace />;
  }
  if (!draft || draft.id !== item.id) {
    return null;
  }

  return (
    <AdminEdit
      item={item}
      draft={draft}
      setDraft={setDraft}
      onSave={() => screenProps.onSave(item)}
      onHold={() => screenProps.onHold(item)}
      onPublish={() => screenProps.onPublish(item)}
      onDelete={() => screenProps.onDelete(item)}
      onBack={screenProps.onBack}
    />
  );
}

interface PreviewRouteProps {
  items: ReadingItem[];
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
}

function PreviewRoute({ items, ...screenProps }: PreviewRouteProps) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return <Navigate to="/admin/readings" replace />;
  }

  return (
    <PreviewScreen
      item={item}
      onHold={() => screenProps.onHold(item)}
      onPublish={() => screenProps.onPublish(item)}
      onDelete={() => screenProps.onDelete(item)}
      onBack={screenProps.onBack}
    />
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen = screenForPath(location.pathname);
  const [authenticated, setAuthenticated] = useState<boolean>(true);
  const [role, setRole] = useState<Role>("admin");
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [totalGenerated, setTotalGenerated] = useState(totalGeneratedInitial);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([
    {
      itemId: "society",
      status: "correct",
      isCorrect: true,
      elapsedSeconds: 228,
      submittedAt: "2026-08-29T02:00:00Z",
      lengthType: "long",
      officialLevel: "N3",
    },
    {
      itemId: "shopping",
      status: "wrong",
      isCorrect: false,
      elapsedSeconds: 182,
      submittedAt: "2026-08-28T04:00:00Z",
      lengthType: "short",
      officialLevel: "N2",
    },
    {
      itemId: "cooking",
      status: "correct",
      isCorrect: true,
      elapsedSeconds: 166,
      submittedAt: "2026-08-20T04:00:00Z",
      lengthType: "medium",
      officialLevel: "N2",
    },
  ]);
  const filters = useMemo<ListFilters>(
    () => ({
      level:
        (searchParams.get("level") as ListFilters["level"] | null) ??
        defaultListFilters.level,
      length:
        (searchParams.get("length") as ListFilters["length"] | null) ??
        defaultListFilters.length,
      status:
        (searchParams.get("status") as ListFilters["status"] | null) ??
        defaultListFilters.status,
      sort:
        (searchParams.get("sort") as ListFilters["sort"] | null) ??
        defaultListFilters.sort,
    }),
    [searchParams],
  );
  const query = searchParams.get("q") ?? "";
  const [adminFilters, setAdminFilters] = useState<AdminFilters>({
    level: "all",
    length: "all",
    topic: "all",
    status: "all",
    sort: "updated-desc",
  });
  const [filterDraft, setFilterDraft] = useState(filters);
  const [adminFilterDraft, setAdminFilterDraft] = useState(adminFilters);
  const filterDraftRef = useRef(filterDraft);
  const adminFilterDraftRef = useRef(adminFilterDraft);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [toast, setToast] = useState("");
  const [attempt, setAttempt] = useState<ReadingAttempt | null>(null);
  const [pendingAbandon, setPendingAbandon] = useState(false);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [draft, setDraft] = useState<ReadingItem | null>(null);
  const [generation, setGeneration] = useState<GenerationValues>({
    level: "N2",
    length: "medium",
    topic: "추천",
  });
  const [dialogError, setDialogError] = useState("");
  const [reportText, setReportText] = useState("");
  const reportTextRef = useRef(reportText);
  const [feedback, setFeedback] = useState<FeedbackValues>({
    quality: "",
    level: "",
    comment: "",
  });
  const feedbackRef = useRef(feedback);

  const activeItem = items.find((item) => item.id === attempt?.itemId);
  const publishedItems = items.filter((item) => item.status === "published");
  const completeCount = Object.keys(latestAttempts(attempts)).length;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!pendingAbandon || screen === "reading") return;
    setAttempt(null);
    setPendingAbandon(false);
  }, [pendingAbandon, screen]);

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

  useEffect(() => {
    if (screen !== "reading" || !attempt || attempt.submitted) {
      return undefined;
    }
    const tick = () =>
      setAttempt((current) =>
        current
          ? {
              ...current,
              elapsedSeconds: Math.floor(
                (Date.now() - current.startedAt) / 1000,
              ),
            }
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
  const updateItem = (id: string, next: Partial<ReadingItem>) =>
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, ...next, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  const writeListParams = (
    next: ListFilters & { query: string },
    { replace = false }: { replace?: boolean } = {},
  ) => {
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.level !== defaultListFilters.level) {
      params.set("level", next.level);
    }
    if (next.length !== defaultListFilters.length) {
      params.set("length", next.length);
    }
    if (next.status !== defaultListFilters.status) {
      params.set("status", next.status);
    }
    if (next.sort !== defaultListFilters.sort) {
      params.set("sort", next.sort);
    }
    setSearchParams(params, { replace });
  };
  const setListFilters = (next: ListFilters) =>
    writeListParams({ ...next, query });
  const setListQuery = (nextQuery: string) =>
    writeListParams({ ...filters, query: nextQuery }, { replace: true });

  const openStartDialog = (
    item: ReadingItem,
    existing: AttemptRecord | undefined,
  ) =>
    openDialog({
      kicker: "Start reading",
      title:
        existing?.status === "wrong"
          ? "오답 문항을 다시 풀까요?"
          : existing?.status === "correct"
            ? "문항을 다시 풀까요?"
            : "독해를 시작할까요?",
      description: existing
        ? "새 답안과 풀이 시간을 기록합니다."
        : "문제를 열면 풀이 시간이 시작됩니다.",
      confirmLabel: existing ? "다시 풀기" : "시작하기",
      onConfirm: () => {
        closeDialog();
        setResult(null);
        setAttempt({
          itemId: item.id,
          startedAt: Date.now(),
          elapsedSeconds: 0,
          selectedChoiceId: null,
          choices: shuffle(item.choices),
          submitted: false,
          message: "",
        });
        navigate(`/readings/${item.id}`);
      },
    });

  const start = (item: ReadingItem) => {
    const existing = latestAttempts(attempts)[item.id];
    if (authenticated) {
      openStartDialog(item, existing);
      return;
    }
    openDialog({
      kicker: "Sign in",
      title: "로그인할까요?",
      description: "로그인하면 풀이 결과와 학습 통계를 기록할 수 있습니다.",
      confirmLabel: "로그인하기",
      onConfirm: () => {
        closeDialog();
        setAuthenticated(true);
        setRole("admin");
        openStartDialog(item, existing);
      },
    });
  };

  const navigateFromReading = (target: string, targetLabel: string) => {
    if (screen === "reading" && attempt && !attempt.submitted) {
      openDialog({
        kicker: "Leave reading",
        title: "풀이를 포기할까요?",
        description: `현재 답안과 풀이 시간은 저장되지 않고 ${targetLabel}으로 이동합니다.`,
        confirmLabel: "포기하고 이동",
        onConfirm: () => {
          closeDialog();
          setPendingAbandon(true);
          navigate(target);
          setToast(`풀이를 포기하고 ${targetLabel}으로 이동했습니다.`);
        },
      });
      return;
    }
    navigate(target);
  };

  const goHome = () => {
    if (screen === "home") return;
    navigateFromReading("/", "독해 목록");
  };

  const submit = () => {
    if (!attempt || !activeItem) return;
    if (!attempt.selectedChoiceId) {
      setAttempt({
        ...attempt,
        message: "선택지를 하나 고른 뒤 제출할 수 있습니다.",
      });
      return;
    }
    openDialog({
      kicker: "Submit answer",
      title: "답안을 제출할까요?",
      description:
        "제출하면 이 화면에서 정답과 선택지 해설을 확인할 수 있습니다.",
      confirmLabel: "제출하기",
      onConfirm: () => {
        const selected = attempt.choices.find(
          (choice) => choice.id === attempt.selectedChoiceId,
        );
        if (!selected) return;
        const submitted: ReadingResult = {
          itemId: activeItem.id,
          item: activeItem,
          choices: attempt.choices,
          selectedChoiceId: selected.id,
          isCorrect: Boolean(selected.isCorrect),
          elapsedSeconds: attempt.elapsedSeconds,
        };
        closeDialog();
        setResult(submitted);
        setAttempt({ ...attempt, submitted: true });
        setAttempts((current) => [
          ...current,
          {
            itemId: activeItem.id,
            status: selected.isCorrect ? "correct" : "wrong",
            isCorrect: Boolean(selected.isCorrect),
            elapsedSeconds: attempt.elapsedSeconds,
            submittedAt: new Date().toISOString(),
            lengthType: activeItem.lengthType,
            officialLevel: activeItem.officialLevel,
          },
        ]);
      },
    });
  };

  const deleteItem = (item: ReadingItem, target = "/admin/readings") =>
    openDialog({
      kicker: "Delete item",
      title: "문항을 삭제할까요?",
      description:
        "문항과 연결된 기록을 영구 삭제합니다. 삭제한 문항은 복구할 수 없습니다.",
      confirmLabel: "삭제하기",
      onConfirm: () => {
        closeDialog();
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setAttempts((current) =>
          current.filter((entry) => entry.itemId !== item.id),
        );
        setTotalGenerated((current) => current - 1);
        navigate(target);
        setToast("문항을 삭제했습니다.");
      },
    });

  const createDraft = () =>
    openDialog({
      kicker: "Generate reading",
      title: "새 독해 지문을 만들까요?",
      description:
        "선택한 조건으로 지문과 문항을 만든 뒤 검토 화면으로 이동합니다.",
      confirmLabel: "지문 만들기",
      onConfirm: () => {
        const source = items.find((item) => item.id === "library") ?? items[0];
        if (!source) {
          closeDialog();
          setToast("생성 기준 문항을 찾을 수 없습니다.");
          return;
        }
        const base = structuredClone(source);
        const id = `generated-${Date.now()}`;
        const now = new Date().toISOString();
        const topic: Topic =
          generation.topic === "추천" ? "교육" : generation.topic;
        const newItem: ReadingItem = {
          ...base,
          id,
          title: `${topic}를 읽는 방법`,
          status: "review",
          officialLevel: generation.level,
          lengthType: generation.length,
          topic,
          recommendedSeconds: defaultRecommendedSeconds[generation.length],
          perceivedLevel: generation.level,
          perceivedVotes: 0,
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          quality: 0,
          reportCount: 0,
          latestReport: "접수된 오류 제보가 없습니다.",
          choices: base.choices.map((choice, index) => ({
            ...choice,
            id: `${id}-${index + 1}`,
          })),
        };
        closeDialog();
        setItems((current) => [...current, newItem]);
        setTotalGenerated((current) => current + 1);
        navigate(`/admin/readings/${id}/preview`);
      },
    });

  const openListFilters = () => {
    setFilterDraft(filters);
    openDialog({
      type: "list-filter",
      kicker: "Filter list",
      title: "필터 및 정렬",
      description: "조건을 선택한 뒤 적용해 주세요.",
      confirmLabel: "적용하기",
      onConfirm: () => {
        setListFilters(filterDraftRef.current);
        closeDialog();
      },
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
        setAdminFilters(adminFilterDraftRef.current);
        closeDialog();
      },
    });
  };

  const openReport = () => {
    setReportText("");
    openDialog({
      type: "report",
      kicker: "Report issue",
      title: "오류를 알려주세요",
      description: "제보는 이 문항 정보와 함께 검토됩니다.",
      confirmLabel: "제보 보내기",
      onConfirm: () => {
        if (!reportTextRef.current.trim()) {
          setDialogError("제보 내용을 입력해 주세요.");
          return;
        }
        closeDialog();
        setToast("오류 제보가 접수되었습니다. 고맙습니다.");
      },
    });
  };

  const openFeedback = () => {
    setFeedback({ quality: "", level: "", comment: "" });
    openDialog({
      type: "feedback",
      kicker: "Rate question",
      title: "문항을 평가해 주세요",
      description: "다음 문항을 만드는 데 반영합니다.",
      confirmLabel: "평가 보내기",
      onConfirm: () => {
        if (!feedbackRef.current.quality || !feedbackRef.current.level) {
          setDialogError("문항 품질과 체감 난이도를 선택해 주세요.");
          return;
        }
        closeDialog();
        setToast("문항 평가가 반영되었습니다. 고맙습니다.");
      },
    });
  };

  const openAdminScreen = () =>
    navigateFromReading("/admin/readings", "관리자 화면");

  const openStatsScreen = () =>
    navigateFromReading("/statistics", "학습 통계 화면");

  const openLogin = () =>
    openDialog({
      kicker: "Sign in",
      title: "로그인할까요?",
      description: "로그인하면 풀이 결과와 학습 통계를 기록할 수 있습니다.",
      confirmLabel: "로그인하기",
      onConfirm: () => {
        closeDialog();
        setAuthenticated(true);
        setRole("admin");
        setToast("로그인되었습니다.");
      },
    });

  const openEdit = (item: ReadingItem) => {
    setDraft(structuredClone(item));
    navigate(`/admin/readings/${item.id}/edit`);
  };

  const leaveEditor = (
    target = "/admin/readings",
    targetLabel = "문항 관리",
    afterLeave?: () => void,
  ) => {
    const original = items.find((item) => item.id === draft?.id);
    const editableSnapshot = (item: ReadingItem) =>
      JSON.stringify({
        title: item.title,
        officialLevel: item.officialLevel,
        lengthType: item.lengthType,
        topic: item.topic,
        passage: item.passage,
        question: item.question,
        choices: item.choices.map(({ id, text, isCorrect }) => ({
          id,
          text,
          isCorrect,
        })),
        explanation: item.explanation,
      });
    if (!draft || !original) {
      setDraft(null);
      afterLeave?.();
      navigate(target);
      return;
    }

    const hasUnsavedChanges =
      editableSnapshot(draft) !== editableSnapshot(original);

    if (!hasUnsavedChanges) {
      setDraft(null);
      afterLeave?.();
      navigate(target);
      return;
    }

    openDialog({
      kicker: "Discard changes",
      title: "저장하지 않은 변경사항을 버릴까요?",
      description: `저장하지 않은 편집 내용은 사라지고 ${targetLabel}으로 이동합니다.`,
      confirmLabel: "변경사항 버리기",
      onConfirm: () => {
        closeDialog();
        setDraft(null);
        afterLeave?.();
        navigate(target);
      },
    });
  };

  const logout = () => {
    setAuthenticated(false);
    setRole("learner");
    setAttempt(null);
    setResult(null);
    navigate("/");
    setToast("로그아웃되었습니다.");
  };

  const goHomeFromHeader = () =>
    screen === "admin-edit" ? leaveEditor("/", "독해 목록") : goHome();

  const openAdminFromHeader = () =>
    screen === "admin-edit"
      ? leaveEditor("/admin/readings", "문항 관리")
      : openAdminScreen();

  const openStatsFromHeader = () =>
    screen === "admin-edit"
      ? leaveEditor("/statistics", "학습 통계 화면")
      : openStatsScreen();

  const logoutFromHeader = () =>
    screen === "admin-edit"
      ? leaveEditor("/", "로그아웃 후 독해 목록", logout)
      : logout();

  const handleEditHold = (item: ReadingItem) => {
    if (item.status === "published") {
      openDialog({
        kicker: "Hold published item",
        title: "게시 문항을 보류로 전환할까요?",
        description: "전환하면 학습자 목록에서 이 문항을 볼 수 없습니다.",
        confirmLabel: "보류로 전환",
        onConfirm: () => {
          closeDialog();
          updateItem(item.id, { status: "held" });
          setToast("게시 문항을 보류로 전환했습니다.");
        },
      });
      return;
    }
    const status = item.status === "held" ? "review" : "held";
    updateItem(item.id, { status });
    setToast(
      status === "held" ? "문항을 보류했습니다." : "문항 보류를 취소했습니다.",
    );
  };

  const publishEditingItem = (item: ReadingItem) =>
    openDialog({
      kicker: "Publish item",
      title: "문항을 게시할까요?",
      description: "게시한 문항은 학습자 목록에서 바로 풀이할 수 있습니다.",
      confirmLabel: "게시하기",
      onConfirm: () => {
        closeDialog();
        updateItem(item.id, {
          status: "published",
          publishedAt: item.publishedAt ?? new Date().toISOString(),
        });
        setToast("문항을 게시했습니다.");
      },
    });

  const continueReading = () => {
    if (!result) {
      navigate("/");
      return;
    }
    const current = result.isCorrect
      ? publishedItems[
          (publishedItems.findIndex((item) => item.id === result.item.id) + 1) %
            publishedItems.length
        ]
      : result.item;
    if (current) start(current);
  };

  return (
    <main
      className="app"
      data-screen={screen}
      data-role={role}
      data-authenticated={authenticated}
    >
      <div className="shell">
        <AppHeader
          authenticated={authenticated}
          role={role}
          totalGenerated={totalGenerated}
          completeCount={completeCount}
          onHome={goHomeFromHeader}
          onOpenAdmin={openAdminFromHeader}
          onOpenStats={openStatsFromHeader}
          onLogin={openLogin}
          onLogout={logoutFromHeader}
        />
        <Breadcrumb screen={screen} />
        <Routes>
          <Route
            path="/"
            element={
              <ReadingListScreen
                items={publishedItems}
                authenticated={authenticated}
                attempts={attempts}
                filters={filters}
                setFilters={setListFilters}
                query={query}
                setQuery={setListQuery}
                onOpenFilters={openListFilters}
                onStart={start}
              />
            }
          />
          <Route
            path="/readings/:itemId"
            element={
              <RequireAuth authenticated={authenticated}>
                <ReadingRoute
                  items={publishedItems}
                  attempt={attempt}
                  result={result}
                  onChoose={(id) => {
                    if (!attempt) return;
                    setAttempt({
                      ...attempt,
                      selectedChoiceId: id,
                      message: "",
                    });
                  }}
                  onSubmit={submit}
                  onAbandon={goHome}
                  onReport={openReport}
                  onResult={() => {
                    if (result) navigate(`/results/${result.itemId}`);
                  }}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/results/:itemId"
            element={
              <RequireAuth authenticated={authenticated}>
                <ResultRoute
                  result={result}
                  onFeedback={openFeedback}
                  onContinue={continueReading}
                  onHome={goHome}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/statistics"
            element={
              <RequireAuth authenticated={authenticated}>
                <StatsScreen attempts={attempts} />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/readings"
            element={
              <RequireAdmin authenticated={authenticated} role={role}>
                <AdminScreen
                  items={items}
                  filters={adminFilters}
                  onFilters={openAdminFilters}
                  onEdit={openEdit}
                  onGenerate={() => navigate("/admin/readings/new")}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/readings/new"
            element={
              <RequireAdmin authenticated={authenticated} role={role}>
                <GenerateScreen
                  values={generation}
                  setValues={setGeneration}
                  onCreate={createDraft}
                  onBack={() => navigate("/admin/readings")}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/readings/:itemId/edit"
            element={
              <RequireAdmin authenticated={authenticated} role={role}>
                <AdminEditRoute
                  items={items}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={(item) => {
                    if (!draft) return;
                    updateItem(item.id, draft);
                    setToast("문항 변경사항을 저장했습니다.");
                  }}
                  onHold={handleEditHold}
                  onPublish={publishEditingItem}
                  onDelete={deleteItem}
                  onBack={leaveEditor}
                />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/readings/:itemId/preview"
            element={
              <RequireAdmin authenticated={authenticated} role={role}>
                <PreviewRoute
                  items={items}
                  onHold={(item) => {
                    const status = item.status === "held" ? "review" : "held";
                    updateItem(item.id, { status });
                    setToast(
                      status === "held"
                        ? "문항을 보류했습니다."
                        : "문항 보류를 취소했습니다.",
                    );
                  }}
                  onPublish={(item) =>
                    openDialog({
                      kicker: "Publish draft",
                      title: "문항을 게시할까요?",
                      description: "게시한 문항은 목록에서 바로 풀이할 수 있습니다.",
                      confirmLabel: "게시하기",
                      onConfirm: () => {
                        closeDialog();
                        updateItem(item.id, {
                          status: "published",
                          publishedAt: new Date().toISOString(),
                        });
                        navigate("/admin/readings");
                        setToast("문항을 게시했습니다.");
                      },
                    })
                  }
                  onDelete={deleteItem}
                  onBack={() => navigate("/admin/readings")}
                />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {screen === "stats" ? (
        <nav className="scroll-controls" aria-label="통계 페이지 이동">
          <button
            className="scroll-control-button"
            type="button"
            aria-label="통계 맨 위로"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <Icon icon={ChevronUp} />
          </button>
          <button
            className="scroll-control-button"
            type="button"
            aria-label="통계 맨 아래로"
            onClick={() =>
              window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: "smooth",
              })
            }
          >
            <Icon icon={ChevronDown} />
          </button>
        </nav>
      ) : null}
      <Dialog dialog={dialog} onClose={closeDialog}>
        <AppDialogContent
          type={dialog?.type}
          authenticated={authenticated}
          filterDraft={filterDraft}
          setFilterDraft={setFilterDraft}
          adminFilterDraft={adminFilterDraft}
          setAdminFilterDraft={setAdminFilterDraft}
          reportText={reportText}
          setReportText={setReportText}
          feedback={feedback}
          setFeedback={setFeedback}
          dialogError={dialogError}
        />
      </Dialog>
      {toast ? (
        <div className="toast is-visible" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
