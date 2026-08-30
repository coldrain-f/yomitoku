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
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("dialog-open");
      document.body.style.removeProperty("--scrollbar-compensation");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialog, onClose]);

  if (!dialog) return null;

  return (
    <div
      className="dialog-backdrop"
        onMouseDown={(event: MouseEvent<HTMLDivElement>) =>
          event.currentTarget === event.target && onClose()
        }
    >
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="닫기"
          title="닫기"
          onClick={onClose}
        >
          <Icon icon={X} />
        </button>
        <p className="kicker">{dialog.kicker}</p>
        <h2 className="dialog-title" id="dialog-title">
          {dialog.title}
        </h2>
        <p className="body-copy">{dialog.description}</p>
        {children}
        <div className="dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            취소
          </button>
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
