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
import { api, recordFromResult, type Statistics } from "./lib/api";
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
} from "./types";

const defaultListFilters: ListFilters = {
  level: "all",
  length: "all",
  status: "all",
  sort: "published-desc",
};
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

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
  onAbandon,
  onReport,
  onResult,
}: {
  items: ReadingItem[];
  attempt: ReadingAttempt | null;
  result: ReadingResult | null;
  onChoose: (choiceId: string) => void;
  onSubmit: () => void;
  onAbandon: () => void;
  onReport: () => void;
  onResult: () => void;
}) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);
  if (!item || attempt?.itemId !== item.id) return <Navigate to="/" replace />;
  return (
    <ReadingScreen
      item={item}
      attempt={attempt}
      result={result}
      onChoose={onChoose}
      onSubmit={onSubmit}
      onAbandon={onAbandon}
      onReport={onReport}
      onResult={onResult}
    />
  );
}

function ResultRoute({
  result,
  onFeedback,
  onContinue,
  onHome,
}: {
  result: ReadingResult | null;
  onFeedback: () => void;
  onContinue: () => void;
  onHome: () => void;
}) {
  const { itemId } = useParams();
  if (!result || result.itemId !== itemId) return <Navigate to="/" replace />;
  return (
    <ResultScreen
      result={result}
      onFeedback={onFeedback}
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
}: {
  items: ReadingItem[];
  draft: ReadingItem | null;
  setDraft: StateSetter<ReadingItem | null>;
  onSave: () => void;
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
}) {
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);

  useEffect(() => {
    if (item && (!draft || draft.id !== item.id)) setDraft(structuredClone(item));
  }, [draft?.id, item, setDraft]);

  if (!item) return <Navigate to="/admin/readings" replace />;
  if (!draft || draft.id !== item.id) return null;
  return (
    <AdminEdit
      item={item}
      draft={draft}
      setDraft={setDraft}
      onSave={onSave}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(item)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen = screenForPath(location.pathname);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>("learner");
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [adminItems, setAdminItems] = useState<ReadingItem[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
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
  const [pendingStart, setPendingStart] = useState<ReadingItem | null>(null);
  const [toast, setToast] = useState("");
  const [attempt, setAttempt] = useState<ReadingAttempt | null>(null);
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
  const completeCount = statistics?.completedCount ?? 0;
  const totalGenerated = statistics?.totalGeneratedCount ?? 0;

  const loadPublicItems = async () => {
    const response = await api.listReadings({ pageSize: 50 });
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
  };
  const loadStatistics = async () => setStatistics(await api.statistics());
  const loadAdminItems = async () => {
    const response = await api.listAdminReadings({ pageSize: 50 });
    setAdminItems(response.items);
    setAdminLoaded(true);
  };
  const replaceAdminItem = (next: ReadingItem) =>
    setAdminItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current],
    );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await api.me();
        if (!active) return;
        setAuthenticated(true);
        setRole(user.role);
        const requests: Promise<unknown>[] = [loadPublicItems(), loadStatistics()];
        if (user.role === "admin") requests.push(loadAdminItems());
        await Promise.all(requests);
      } catch (error) {
        if (!active) return;
        setAuthenticated(false);
        setRole("learner");
        try {
          await loadPublicItems();
        } catch {
          setToast(error instanceof Error ? error.message : "서버에 연결할 수 없습니다.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
    if (dialog?.type === "google-login") setPendingStart(null);
    setDialog(null);
    setDialogError("");
  };
  const openDialog = (value: DialogConfig) => {
    setDialogError("");
    setDialog(value);
  };
  const writeListParams = (
    next: ListFilters & { query: string },
    { replace = false }: { replace?: boolean } = {},
  ) => {
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.level !== "all") params.set("level", next.level);
    if (next.length !== "all") params.set("length", next.length);
    if (next.status !== "all") params.set("status", next.status);
    if (next.sort !== "published-desc") params.set("sort", next.sort);
    setSearchParams(params, { replace });
  };
  const setListFilters = (next: ListFilters) => writeListParams({ ...next, query });
  const setListQuery = (nextQuery: string) =>
    writeListParams({ ...filters, query: nextQuery }, { replace: true });

  const openStartDialog = (
    item: ReadingItem,
    existing: ReadingItem["myLatestStatus"],
  ) =>
    openDialog({
      kicker: "Start reading",
      title:
        existing === "wrong"
          ? "오답 문항을 다시 풀까요?"
          : existing === "correct"
            ? "문항을 다시 풀까요?"
            : "독해를 시작할까요?",
      description: existing ? "새 답안과 풀이 시간을 기록합니다." : "문제를 열면 풀이 시간이 시작됩니다.",
      confirmLabel: existing ? "다시 풀기" : "시작하기",
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            const detail = await api.reading(item.id);
            const started = await api.startAttempt(item.id);
            const readingItem: ReadingItem = {
              ...item,
              title: detail.title,
              officialLevel: detail.officialLevel,
              lengthType: detail.lengthType,
              topic: detail.topic,
              recommendedSeconds: detail.recommendedSeconds,
              passage: detail.passage,
              question: detail.question,
              choices: started.choices,
            };
            setItems((current) =>
              current.map((currentItem) =>
                currentItem.id === readingItem.id ? readingItem : currentItem,
              ),
            );
            setResult(null);
            setAttempt({
              attemptId: started.id,
              itemId: item.id,
              startedAt: Date.now(),
              elapsedSeconds: 0,
              selectedChoiceId: null,
              choices: started.choices,
              submitted: false,
              message: "",
            });
            navigate(`/readings/${item.id}`);
          } catch (error) {
            setToast(error instanceof Error ? error.message : "문항을 열지 못했습니다.");
          }
        })();
      },
    });

  const start = (item: ReadingItem) => {
    if (authenticated) {
      openStartDialog(item, item.myLatestStatus);
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
      kicker: "Leave reading",
      title: "풀이를 포기할까요?",
      description: `현재 답안과 풀이 시간은 저장되지 않고 ${targetLabel}으로 이동합니다.`,
      confirmLabel: "포기하고 이동",
      onConfirm: () => {
        closeDialog();
        void api.abandonAttempt(attempt.attemptId);
        setAttempt(null);
        navigate(target);
        setToast(`풀이를 포기하고 ${targetLabel}으로 이동했습니다.`);
      },
    });
  };
  const goHome = () => {
    if (screen !== "home") abandonAndNavigate("/", "독해 목록");
  };

  const submit = () => {
    if (!attempt || !activeItem) return;
    if (!attempt.selectedChoiceId) {
      setAttempt({ ...attempt, message: "선택지를 하나 고른 뒤 제출할 수 있습니다." });
      return;
    }
    const selectedChoiceId = attempt.selectedChoiceId;
    openDialog({
      kicker: "Submit answer",
      title: "답안을 제출할까요?",
      description: "제출하면 이 화면에서 정답과 선택지 해설을 확인할 수 있습니다.",
      confirmLabel: "제출하기",
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            const submitted = await api.submitAttempt(
              attempt.attemptId,
              selectedChoiceId,
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
            };
            setResult(nextResult);
            setAttempt({ ...attempt, submitted: true, elapsedSeconds: submitted.elapsedSeconds });
            setAttempts((current) => [...current, recordFromResult(activeItem, submitted)]);
            await Promise.all([loadStatistics(), loadPublicItems()]);
          } catch (error) {
            setToast(error instanceof Error ? error.message : "답안을 제출하지 못했습니다.");
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
        void (async () => {
          try {
            let job = await api.createGenerationJob(generation);
            for (let retry = 0; retry < 45 && !job.generatedItemId; retry += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 800));
              job = await api.generationJob(job.id);
              if (job.status === "failed") throw new Error(job.errorDetail ?? "지문 생성에 실패했습니다.");
            }
            if (!job.generatedItemId) throw new Error("지문 생성 시간이 초과되었습니다.");
            const item = await api.adminReading(job.generatedItemId);
            replaceAdminItem(item);
            navigate(`/admin/readings/${item.id}/preview`);
          } catch (error) {
            setToast(error instanceof Error ? error.message : "지문을 만들지 못했습니다.");
          }
        })();
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
    if (!activeItem) return;
    setReportText("");
    openDialog({
      type: "report",
      kicker: "Report issue",
      title: "오류를 알려주세요",
      description: "제보는 이 문항 정보와 함께 검토됩니다.",
      confirmLabel: "제보 보내기",
      onConfirm: () => {
        const content = reportTextRef.current.trim();
        if (!content) {
          setDialogError("제보 내용을 입력해 주세요.");
          return;
        }
        closeDialog();
        void api
          .report(activeItem.id, content)
          .then(() => setToast("오류 제보가 접수되었습니다. 고맙습니다."))
          .catch((error: unknown) =>
            setToast(error instanceof Error ? error.message : "제보를 보내지 못했습니다."),
          );
      },
    });
  };
  const openFeedback = () => {
    if (!result) return;
    setFeedback({ quality: "", level: "", comment: "" });
    openDialog({
      type: "feedback",
      kicker: "Rate question",
      title: "문항을 평가해 주세요",
      description: "다음 문항을 만드는 데 반영합니다.",
      confirmLabel: "평가 보내기",
      onConfirm: () => {
        const values = feedbackRef.current;
        if (!values.quality || !values.level) {
          setDialogError("문항 품질과 체감 난이도를 선택해 주세요.");
          return;
        }
        closeDialog();
        void api
          .feedback(result.itemId, Number(values.quality), values.level, values.comment)
          .then(() => setToast("문항 평가가 반영되었습니다. 고맙습니다."))
          .catch((error: unknown) =>
            setToast(error instanceof Error ? error.message : "평가를 보내지 못했습니다."),
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
      setRole(user.role);
      await Promise.all([
        loadPublicItems(),
        loadStatistics(),
        ...(user.role === "admin" ? [loadAdminItems()] : []),
      ]);
      setPendingStart(null);
      closeDialog();
      setToast("로그인되었습니다.");
      if (itemToStart) openStartDialog(itemToStart, itemToStart.myLatestStatus);
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "로그인하지 못했습니다. 다시 시도해 주세요.",
      );
    }
    })();
  };
  const openLogin = () =>
    openDialog({
      type: "google-login",
      kicker: "Sign in",
      title: "Google 계정으로 로그인",
      description: "로그인하면 풀이 결과와 학습 통계를 기록할 수 있습니다.",
    });
  const logout = () => {
    void api.logout().catch(() => undefined);
    api.clearAccessToken();
    setAuthenticated(false);
    setRole("learner");
    setAttempt(null);
    setResult(null);
    setStatistics(null);
    navigate("/");
    setToast("로그아웃되었습니다.");
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
    try {
      const next = await api.updateAdminReading(item);
      replaceAdminItem(next);
      setDraft(structuredClone(next));
      setToast("문항 변경사항을 저장했습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "문항을 저장하지 못했습니다.");
    }
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
        closeDialog();
        void (async () => {
          try {
            const next = await api.publish(item.id);
            replaceAdminItem(next);
            setDraft((current) => (current?.id === next.id ? structuredClone(next) : current));
            await Promise.all([loadPublicItems(), loadStatistics()]);
            setToast("문항을 게시했습니다.");
          } catch (error) {
            setToast(error instanceof Error ? error.message : "문항을 게시하지 못했습니다.");
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
  const goHomeFromHeader = () =>
    screen === "admin-edit" ? leaveEditor("/", "독해 목록") : goHome();
  const openAdminFromHeader = () => {
    if (!adminLoaded) void loadAdminItems().catch(() => setToast("관리 목록을 불러오지 못했습니다."));
    screen === "admin-edit"
      ? leaveEditor("/admin/readings", "문항 관리 화면")
      : abandonAndNavigate("/admin/readings", "관리자 화면");
  };
  const openStatsFromHeader = () =>
    screen === "admin-edit"
      ? leaveEditor("/statistics", "학습 통계 화면")
      : abandonAndNavigate("/statistics", "학습 통계 화면");
  const logoutFromHeader = () =>
    screen === "admin-edit" ? leaveEditor("/", "로그아웃 후 독해 목록", logout) : logout();

  return (
    <main className="app" data-screen={screen} data-role={role} data-authenticated={authenticated}>
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
            element={<ReadingListScreen items={items} authenticated={authenticated} attempts={attempts} filters={filters} setFilters={setListFilters} query={query} setQuery={setListQuery} onOpenFilters={openListFilters} onStart={start} />}
          />
          <Route path="/readings/:itemId" element={<RequireAuth authenticated={authenticated}><ReadingRoute items={items} attempt={attempt} result={result} onChoose={(id) => setAttempt((current) => current ? { ...current, selectedChoiceId: id, message: "" } : current)} onSubmit={submit} onAbandon={goHome} onReport={openReport} onResult={() => result && navigate(`/results/${result.itemId}`)} /></RequireAuth>} />
          <Route path="/results/:itemId" element={<RequireAuth authenticated={authenticated}><ResultRoute result={result} onFeedback={openFeedback} onContinue={continueReading} onHome={goHome} /></RequireAuth>} />
          <Route path="/statistics" element={<RequireAuth authenticated={authenticated}><StatsScreen statistics={statistics} /></RequireAuth>} />
          <Route path="/admin/readings" element={<RequireAdmin authenticated={authenticated} role={role}><AdminScreen items={adminItems} filters={adminFilters} onFilters={openAdminFilters} onEdit={openEdit} onGenerate={() => navigate("/admin/readings/new")} /></RequireAdmin>} />
          <Route path="/admin/readings/new" element={<RequireAdmin authenticated={authenticated} role={role}><GenerateScreen values={generation} setValues={setGeneration} onCreate={createDraft} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/edit" element={<RequireAdmin authenticated={authenticated} role={role}><AdminEditRoute items={adminItems} draft={draft} setDraft={setDraft} onSave={() => draft && void updateAdminItem(draft)} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={leaveEditor} /></RequireAdmin>} />
          <Route path="/admin/readings/:itemId/preview" element={<RequireAdmin authenticated={authenticated} role={role}><PreviewRoute items={adminItems} onHold={changeHold} onPublish={publishItem} onDelete={deleteItem} onBack={() => navigate("/admin/readings")} /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {screen === "stats" ? (
        <nav className="scroll-controls" aria-label="통계 페이지 이동">
          <button className="scroll-control-button" type="button" aria-label="통계 맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon icon={ChevronUp} /></button>
          <button className="scroll-control-button" type="button" aria-label="통계 맨 아래로" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}><Icon icon={ChevronDown} /></button>
        </nav>
      ) : null}
      <Dialog dialog={dialog} onClose={closeDialog}>
        <AppDialogContent type={dialog?.type} authenticated={authenticated} filterDraft={filterDraft} setFilterDraft={setFilterDraft} adminFilterDraft={adminFilterDraft} setAdminFilterDraft={setAdminFilterDraft} reportText={reportText} setReportText={setReportText} feedback={feedback} setFeedback={setFeedback} dialogError={dialogError} googleClientId={googleClientId} onGoogleCredential={completeGoogleLogin} onGoogleError={setDialogError} />
      </Dialog>
      {toast ? <div className="toast is-visible" role="status">{toast}</div> : null}
    </main>
  );
}
