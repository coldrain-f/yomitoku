import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AdminEdit, AdminScreen, GenerateScreen, PreviewScreen } from "./features/admin/AdminScreens.jsx";
import {
  ReadingListScreen,
  ReadingScreen,
  ResultScreen,
} from "./features/readings/ReadingScreens.jsx";
import { StatsScreen } from "./features/statistics/StatsScreen.jsx";
import { AppDialogContent } from "./components/AppDialogContent.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import { Breadcrumb } from "./components/ui/Breadcrumb.jsx";
import { Dialog } from "./components/ui/Dialog.jsx";
import { Icon } from "./components/ui/Icon.jsx";
import { initialItems } from "./data.js";
import {
  latestAttempts,
  shuffle,
  totalGeneratedInitial,
} from "./lib/reading.js";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [authenticated, setAuthenticated] = useState(true);
  const [role, setRole] = useState("admin");
  const [items, setItems] = useState(initialItems);
  const [totalGenerated, setTotalGenerated] = useState(totalGeneratedInitial);
  const [attempts, setAttempts] = useState([
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
  const [filters, setFilters] = useState({
    level: "all",
    length: "all",
    status: "all",
    sort: "published-desc",
  });
  const [adminFilters, setAdminFilters] = useState({
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
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [generation, setGeneration] = useState({
    level: "N2",
    length: "medium",
    topic: "추천",
  });
  const [previewId, setPreviewId] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [reportText, setReportText] = useState("");
  const reportTextRef = useRef(reportText);
  const [feedback, setFeedback] = useState({
    quality: "",
    level: "",
    comment: "",
  });
  const feedbackRef = useRef(feedback);

  const activeItem = items.find((item) => item.id === activeId);
  const editingItem = items.find((item) => item.id === editingId);
  const previewItem = items.find((item) => item.id === previewId);
  const publishedItems = items.filter((item) => item.status === "published");
  const completeCount = Object.keys(latestAttempts(attempts)).length;

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
  const openDialog = (value) => {
    setDialogError("");
    setDialog(value);
  };
  const updateItem = (id, next) =>
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, ...next, updatedAt: new Date().toISOString() }
          : item,
      ),
    );

  const openStartDialog = (item, existing) =>
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
        setActiveId(item.id);
        setResult(null);
        setAttempt({
          startedAt: Date.now(),
          elapsedSeconds: 0,
          selectedChoiceId: null,
          choices: shuffle(item.choices),
          submitted: false,
          message: "",
        });
        setScreen("reading");
      },
    });

  const start = (item) => {
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

  const goHome = () => {
    if (screen === "home") return;
    if (screen === "reading" && attempt && !attempt.submitted) {
      openDialog({
        kicker: "Leave reading",
        title: "풀이를 포기할까요?",
        description:
          "현재 답안과 풀이 시간은 저장되지 않고 목록으로 돌아갑니다.",
        confirmLabel: "포기하기",
        onConfirm: () => {
          closeDialog();
          setAttempt(null);
          setScreen("home");
          setToast("풀이를 포기하고 목록으로 돌아왔습니다.");
        },
      });
      return;
    }
    openDialog({
      kicker: "Back to list",
      title: "목록으로 돌아갈까요?",
      description: "현재 화면을 닫고 독해 목록으로 돌아갑니다.",
      confirmLabel: "목록으로",
      onConfirm: () => {
        closeDialog();
        setScreen("home");
      },
    });
  };

  const submit = () => {
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
        const submitted = {
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

  const deleteItem = (item, target = "admin") =>
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
        setScreen(target);
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
        const base = structuredClone(
          items.find((item) => item.id === "library") ?? items[0],
        );
        const id = `generated-${Date.now()}`;
        const now = new Date().toISOString();
        const topic = generation.topic === "추천" ? "교육" : generation.topic;
        const newItem = {
          ...base,
          id,
          title: `${topic}를 읽는 방법`,
          status: "review",
          officialLevel: generation.level,
          lengthType: generation.length,
          topic,
          recommendedSeconds: { short: 60, medium: 150, long: 270 }[
            generation.length
          ],
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
        setPreviewId(id);
        setScreen("preview");
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
        setFilters(filterDraftRef.current);
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
    openDialog({
      kicker: "Open management",
      title: "관리자 화면으로 이동할까요?",
      description: "문항을 생성하고 관리하는 관리자 화면으로 이동합니다.",
      confirmLabel: "이동하기",
      onConfirm: () => {
        closeDialog();
        setScreen("admin");
      },
    });

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

  const openLogout = () =>
    openDialog({
      kicker: "Sign out",
      title: "로그아웃할까요?",
      description: "이 기기에서 현재 계정의 로그인이 해제됩니다.",
      confirmLabel: "로그아웃",
      onConfirm: () => {
        closeDialog();
        setAuthenticated(false);
        setRole("learner");
        setScreen("home");
        setToast("로그아웃되었습니다.");
      },
    });

  const openEdit = (item) => {
    setEditingId(item.id);
    setDraft(structuredClone(item));
    setScreen("admin-edit");
  };

  const handleEditHold = () => {
    if (editingItem.status === "published") {
      openDialog({
        kicker: "Hold published item",
        title: "게시 문항을 보류로 전환할까요?",
        description: "전환하면 학습자 목록에서 이 문항을 볼 수 없습니다.",
        confirmLabel: "보류로 전환",
        onConfirm: () => {
          closeDialog();
          updateItem(editingItem.id, { status: "held" });
          setToast("게시 문항을 보류로 전환했습니다.");
        },
      });
      return;
    }
    const status = editingItem.status === "held" ? "review" : "held";
    updateItem(editingItem.id, { status });
    setToast(
      status === "held" ? "문항을 보류했습니다." : "문항 보류를 취소했습니다.",
    );
  };

  const publishEditingItem = () =>
    openDialog({
      kicker: "Publish item",
      title: "문항을 게시할까요?",
      description: "게시한 문항은 학습자 목록에서 바로 풀이할 수 있습니다.",
      confirmLabel: "게시하기",
      onConfirm: () => {
        closeDialog();
        updateItem(editingItem.id, {
          status: "published",
          publishedAt: editingItem.publishedAt ?? new Date().toISOString(),
        });
        setToast("문항을 게시했습니다.");
      },
    });

  const backToAdmin = () =>
    openDialog({
      kicker: "Back to management",
      title: "문항 관리로 돌아갈까요?",
      description: "현재 화면을 닫고 관리자 문항 관리로 돌아갑니다.",
      confirmLabel: "관리 목록으로",
      onConfirm: () => {
        closeDialog();
        setScreen("admin");
      },
    });

  const handlePreviewHold = () => {
    const status = previewItem.status === "held" ? "review" : "held";
    updateItem(previewItem.id, { status });
    setToast(
      status === "held" ? "문항을 보류했습니다." : "문항 보류를 취소했습니다.",
    );
  };

  const publishPreview = () =>
    openDialog({
      kicker: "Publish draft",
      title: "문항을 게시할까요?",
      description: "게시한 문항은 목록에서 바로 풀이할 수 있습니다.",
      confirmLabel: "게시하기",
      onConfirm: () => {
        closeDialog();
        updateItem(previewItem.id, {
          status: "published",
          publishedAt: new Date().toISOString(),
        });
        setScreen("admin");
        setToast("문항을 게시했습니다.");
      },
    });

  const continueReading = () => {
    const current = result.isCorrect
      ? publishedItems[
          (publishedItems.findIndex((item) => item.id === result.item.id) + 1) %
            publishedItems.length
        ]
      : result.item;
    start(current);
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
          onHome={goHome}
          onOpenAdmin={openAdminScreen}
          onOpenStats={() => setScreen("stats")}
          onLogin={openLogin}
          onLogout={openLogout}
        />
        <Breadcrumb screen={screen} />
        <ReadingListScreen
          items={publishedItems}
          authenticated={authenticated}
          attempts={attempts}
          filters={filters}
          setFilters={setFilters}
          onOpenFilters={openListFilters}
          onStart={start}
        />
        <ReadingScreen
          item={activeItem}
          attempt={attempt}
          result={result}
          onChoose={(id) =>
            setAttempt({ ...attempt, selectedChoiceId: id, message: "" })
          }
          onSubmit={submit}
          onAbandon={goHome}
          onReport={openReport}
          onResult={() => setScreen("result")}
        />
        <ResultScreen
          result={result}
          onFeedback={openFeedback}
          onContinue={continueReading}
          onHome={goHome}
        />
        <StatsScreen attempts={attempts} />
        <AdminScreen
          items={items}
          filters={adminFilters}
          onFilters={openAdminFilters}
          onEdit={openEdit}
          onGenerate={() => setScreen("generate")}
        />
        <AdminEdit
          item={editingItem}
          draft={draft}
          setDraft={setDraft}
          onSave={() => {
            updateItem(editingItem.id, draft);
            setToast("문항 변경사항을 저장했습니다.");
          }}
          onHold={handleEditHold}
          onPublish={publishEditingItem}
          onDelete={() => deleteItem(editingItem)}
          onBack={backToAdmin}
        />
        <GenerateScreen
          values={generation}
          setValues={setGeneration}
          onCreate={createDraft}
          onBack={() => setScreen("admin")}
        />
        <PreviewScreen
          item={previewItem}
          onHold={handlePreviewHold}
          onPublish={publishPreview}
          onDelete={() => deleteItem(previewItem)}
          onBack={() => setScreen("admin")}
        />
      </div>
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
