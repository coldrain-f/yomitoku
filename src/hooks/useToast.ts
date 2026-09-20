import { useCallback, useEffect, useState } from "react";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export function useToast(duration = 2_800) {
  const [toast, setToastMessage] = useState("");
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);

  const setToast = useCallback((message: string, action?: ToastAction) => {
    setToastMessage(message);
    setToastAction(message ? action ?? null : null);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToastMessage("");
      setToastAction(null);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, toast]);

  return { toast, toastAction, setToast };
}
