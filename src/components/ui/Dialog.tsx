import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";
import type { DialogConfig } from "../../types";
import { useI18n } from "../../lib/i18n";
import { useModalFocus } from "../../hooks/useModalFocus";

let scrollLockCount = 0;

interface DialogProps {
  dialog: DialogConfig | null;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ dialog, onClose, children }: DialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);
  const open = Boolean(dialog);
  useModalFocus(dialogRef, open, () => {
    onClose();
    dialog?.onCancel?.();
  });
  useEffect(() => {
    if (!open) return undefined;
    const scrollbarWidth = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    document.body.style.setProperty(
      "--scrollbar-compensation",
      `${scrollbarWidth}px`,
    );
    document.body.classList.add("dialog-open");
    scrollLockCount += 1;
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        document.body.classList.remove("dialog-open");
        document.body.style.removeProperty("--scrollbar-compensation");
      }
    };
  }, [open]);

  if (!dialog) return null;
  const dismiss = () => {
    onClose();
    dialog.onCancel?.();
  };
  const closeLabel =
      dialog.type === "translation" ||
      dialog.type === "score-guide" ||
      dialog.type === "highlights" ||
      dialog.type === "admin-responses"
      ? t("common.close")
      : t("common.cancel");
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target) dismiss();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`confirm-dialog${
          dialog.type === "translation" || dialog.type === "admin-responses"
            ? " confirm-dialog-wide"
            : ""
        }${
          dialog.type === "highlights" ? " confirm-dialog-highlights" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
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
              <div className="dialog-context-meta" aria-label={t("dialog.itemInfo")}>
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
              {t("common.reset")}
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
