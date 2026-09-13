import { useEffect, useState } from "react";

export function useToast(duration = 2_800) {
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), duration);
    return () => window.clearTimeout(timer);
  }, [duration, toast]);

  return { toast, setToast };
}
