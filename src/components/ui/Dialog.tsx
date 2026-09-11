import {
  useEffect,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";
import type { DialogConfig } from "../../types";

interface DialogProps {
  dialog: DialogConfig | null;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ dialog, onClose, children }: DialogProps) {
  useEffect(() => {
    if (!dialog) return undefined;
    const scrollbarWidth = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    document.body.style.setProperty(
      "--scrollbar-compensation",
      `${scrollbarWidth}px`,
    );
    document.body.classList.add("dialog-open");
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        dialog.onCancel?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("dialog-open");
      document.body.style.removeProperty("--scrollbar-compensation");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialog, onClose]);

  if (!dialog) return null;
  const dismiss = () => {
    onClose();
    dialog.onCancel?.();
  };
  const closeLabel =
    dialog.type === "translation" ||
    dialog.type === "score-guide" ||
    dialog.type === "highlights"
      ? "닫기"
      : "취소";
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target) dismiss();
      }}
    >
      <section
        className={`confirm-dialog${
          dialog.type === "translation" || dialog.type === "highlights"
            ? " confirm-dialog-wide"
            : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="닫기"
          title="닫기"
          onClick={dismiss}
        >
          <Icon icon={X} />
        </button>
        <p className="kicker">{dialog.kicker}</p>
        <h2 className="dialog-title" id="dialog-title">
          {dialog.title}
        </h2>
        {dialog.context || dialog.contextMeta?.length ? (
          <div className="dialog-context">
            {dialog.context ? <p className="dialog-context-title">{dialog.context}</p> : null}
            {dialog.contextMeta?.length ? (
              <div className="dialog-context-meta" aria-label="문항 정보">
                {dialog.contextMeta.map((value) => (
                  <span className="badge" key={value}>{value}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {dialog.description ? <p className="body-copy">{dialog.description}</p> : null}
        {children}
        <div className={`dialog-actions${dialog.onReset ? " has-reset" : ""}`}>
          <button className="text-button" type="button" onClick={dismiss}>
            {closeLabel}
          </button>
          {dialog.onReset ? (
            <button
              className="text-button dialog-reset-button"
              type="button"
              onClick={dialog.onReset}
            >
              초기화
            </button>
          ) : null}
          {dialog.confirmLabel && dialog.onConfirm ? (
            <button
              className="primary-button"
              type="button"
              onClick={dialog.onConfirm}
            >
              {dialog.confirmLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
