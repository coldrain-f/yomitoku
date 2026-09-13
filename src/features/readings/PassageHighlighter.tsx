import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Highlighter, X } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import type { PassageHighlight } from "../../types";

interface PassageHighlighterProps {
  passage: string;
  highlights: PassageHighlight[];
  onCreateHighlight: (
    startOffset: number,
    endOffset: number,
    selectedText: string,
  ) => Promise<PassageHighlight>;
  onDeleteHighlight: (highlightId: string) => Promise<void>;
}

interface PendingHighlight {
  startOffset: number;
  endOffset: number;
  selectedText: string;
  left: number;
  top: number;
  placement: "above" | "below" | "bottom";
}

interface HighlightAction {
  highlight: PassageHighlight;
  left: number;
  top: number;
}

function normalizedPassageText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function prefersMobilePlacement() {
  return window.matchMedia?.("(max-width: 760px)").matches ?? window.innerWidth <= 760;
}

async function copyHighlightText(value: string, errorMessage: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error(errorMessage);
}

export function PassageHighlighter({
  passage,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
}: PassageHighlighterProps) {
  const { t } = useI18n();
  const passageRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const floatingActionRef = useRef<HTMLButtonElement>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const preservePendingSelectionUntilRef = useRef(0);
  const [pending, setPending] = useState<PendingHighlight | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightAction | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState("");
  const sourceText = normalizedPassageText(passage);

  const captureSelection = useCallback(() => {
    if (selectionTimerRef.current !== null) {
      window.clearTimeout(selectionTimerRef.current);
    }
    selectionTimerRef.current = window.setTimeout(() => {
      selectionTimerRef.current = null;
      const clearPendingSelection = () => {
        if (Date.now() < preservePendingSelectionUntilRef.current) return;
        setPending(null);
      };
      const root = passageRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        clearPendingSelection();
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        clearPendingSelection();
        return;
      }

      const selectedText = normalizedPassageText(range.toString());
      if (!selectedText.trim()) {
        clearPendingSelection();
        return;
      }
      const beforeSelection = document.createRange();
      beforeSelection.selectNodeContents(root);
      beforeSelection.setEnd(range.startContainer, range.startOffset);
      const startOffset = normalizedPassageText(beforeSelection.toString()).length;
      const endOffset = startOffset + selectedText.length;
      if (sourceText.slice(startOffset, endOffset) !== selectedText) {
        clearPendingSelection();
        return;
      }
      const overlapsExistingHighlight = highlights.some(
        (highlight) =>
          startOffset < highlight.endOffset && highlight.startOffset < endOffset,
      );
      if (overlapsExistingHighlight) {
        clearPendingSelection();
        return;
      }

      const rectangle = range.getBoundingClientRect();
      const preferMobile = prefersMobilePlacement();
      const left = Math.min(
        Math.max(rectangle.left + rectangle.width / 2, 72),
        window.innerWidth - 72,
      );
      const actionHeight = 34;
      const bottomActionTop = rectangle.bottom + 48;
      const shouldUseBottomAction =
        preferMobile && bottomActionTop + actionHeight > window.innerHeight - 16;
      setError("");
      setActiveHighlight(null);
      setPending({
        startOffset,
        endOffset,
        selectedText,
        left,
        top: preferMobile ? bottomActionTop : Math.max(8, rectangle.top - 42),
        placement: shouldUseBottomAction
          ? "bottom"
          : preferMobile
            ? "below"
            : "above",
      });
    }, 0);
  }, [highlights, sourceText]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (actionRef.current?.contains(target) ||
          floatingActionRef.current?.contains(target))
      ) {
        return;
      }
      setPending(null);
      setActiveHighlight(null);
    };
    const hideOnViewportChange = () => {
      setPending(null);
      setActiveHighlight(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("selectionchange", captureSelection);
    window.addEventListener("scroll", hideOnViewportChange, true);
    window.addEventListener("resize", hideOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("selectionchange", captureSelection);
      window.removeEventListener("scroll", hideOnViewportChange, true);
      window.removeEventListener("resize", hideOnViewportChange);
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
    };
  }, [captureSelection]);

  const preservePendingSelection = () => {
    preservePendingSelectionUntilRef.current = Date.now() + 300;
  };

  const createHighlight = async () => {
    if (!pending || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await onCreateHighlight(
        pending.startOffset,
        pending.endOffset,
        pending.selectedText,
      );
      window.getSelection()?.removeAllRanges();
      setPending(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.saveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openHighlightActions = (highlight: PassageHighlight, target: HTMLElement) => {
    const rectangle = target.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    setError("");
    setPending(null);
    setActiveHighlight({
      highlight,
      left: Math.min(
        Math.max(rectangle.left + rectangle.width / 2, 90),
        window.innerWidth - 90,
      ),
      top: Math.max(8, rectangle.top - 42),
    });
  };

  const deleteActiveHighlight = async () => {
    if (!activeHighlight || removingId) return;
    setRemovingId(activeHighlight.highlight.id);
    setError("");
    try {
      await onDeleteHighlight(activeHighlight.highlight.id);
      setActiveHighlight(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.deleteFailed"),
      );
    } finally {
      setRemovingId(null);
    }
  };

  const copyActiveHighlight = async () => {
    if (!activeHighlight || isCopying) return;
    setIsCopying(true);
    setError("");
    try {
      await copyHighlightText(activeHighlight.highlight.selectedText, t("highlight.copyFailed"));
      setActiveHighlight(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.copyFailed"),
      );
    } finally {
      setIsCopying(false);
    }
  };

  const content = (() => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    const validHighlights = [...highlights]
      .filter(
        (highlight) =>
          highlight.startOffset >= 0 &&
          highlight.endOffset > highlight.startOffset &&
          sourceText.slice(highlight.startOffset, highlight.endOffset) ===
            highlight.selectedText,
      )
      .sort((left, right) => left.startOffset - right.startOffset);
    for (const highlight of validHighlights) {
      if (highlight.startOffset < cursor) continue;
      if (cursor < highlight.startOffset) {
        nodes.push(sourceText.slice(cursor, highlight.startOffset));
      }
      nodes.push(
        <mark
          className="passage-highlight"
          key={highlight.id}
          role="button"
          tabIndex={0}
          title={t("highlight.tool")}
          aria-label={t("highlight.toolForText", { text: highlight.selectedText })}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openHighlightActions(highlight, event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openHighlightActions(highlight, event.currentTarget);
          }}
        >
          {sourceText.slice(highlight.startOffset, highlight.endOffset)}
        </mark>,
      );
      cursor = highlight.endOffset;
    }
    if (cursor < sourceText.length) nodes.push(sourceText.slice(cursor));
    return nodes;
  })();

  return (
    <>
      <div className="passage passage-highlightable" ref={passageRef}>
        <p>{content}</p>
      </div>
      {pending ? (
        <div
          className={`passage-highlight-action${
            pending.placement === "bottom" ? " passage-highlight-action-bottom" : ""
          }`}
          ref={actionRef}
          onPointerDown={preservePendingSelection}
          style={
            pending.placement === "bottom"
              ? undefined
              : { left: pending.left, top: pending.top }
          }
        >
          <button type="button" onClick={() => void createHighlight()} disabled={isSaving}>
            <Icon icon={Highlighter} />
            {isSaving ? t("highlight.saving") : t("highlight.save")}
          </button>
        </div>
      ) : null}
      <button
        className={`passage-highlight-fab${pending ? " is-ready" : ""}`}
        ref={floatingActionRef}
        type="button"
        onPointerDown={preservePendingSelection}
        aria-label={
          pending
            ? isSaving
              ? t("highlight.savingLabel")
              : t("highlight.selectToSave")
            : t("highlight.selectHint")
        }
        title={
          pending
            ? isSaving
              ? t("highlight.saving")
              : t("highlight.save")
            : t("highlight.select")
        }
        disabled={!pending || isSaving}
        onClick={() => void createHighlight()}
      >
        <Icon icon={Highlighter} />
        <span className="sr-only">
          {isSaving ? t("highlight.saving") : t("highlight.saveShort")}
        </span>
      </button>
      {activeHighlight ? (
        <div
          className="passage-highlight-menu"
          ref={actionRef}
          style={{ left: activeHighlight.left, top: activeHighlight.top }}
          role="group"
          aria-label={t("highlight.tool")}
        >
          <button
            className="passage-highlight-cancel"
            type="button"
            onClick={() => void deleteActiveHighlight()}
            disabled={removingId === activeHighlight.highlight.id}
          >
            <Icon icon={X} />
            {removingId === activeHighlight.highlight.id
              ? t("highlight.deleting")
              : t("highlight.delete")}
          </button>
          <button type="button" onClick={() => void copyActiveHighlight()} disabled={isCopying}>
            <Icon icon={Copy} />
            {isCopying ? t("highlight.copying") : t("highlight.copy")}
          </button>
        </div>
      ) : null}
      {error ? <p className="passage-highlight-error" role="alert">{error}</p> : null}
    </>
  );
}
