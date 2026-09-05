import { useEffect, useRef, useState } from "react";
import { api, ApiError, type GenerationJob } from "../../lib/api";
import type { GenerationValues } from "../../types";

type Operation =
  | { kind: "discover" }
  | { kind: "existing"; jobId: string }
  | { kind: "create"; key: string; values: GenerationValues };

const storageKey = (owner: string) => `yomitoku.generation.${owner}`;

function store(owner: string, operation: Operation | null) {
  try {
    if (operation) sessionStorage.setItem(storageKey(owner), JSON.stringify(operation));
    else sessionStorage.removeItem(storageKey(owner));
  } catch {
    // Server-side active-job lookup also protects browsers without storage.
  }
}

function restore(owner: string): Operation {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(owner)) ?? "null");
    if (value?.kind === "existing" && typeof value.jobId === "string") return value;
    if (value?.kind === "create" && typeof value.key === "string" && value.values) return value;
  } catch { /* Fall back to the server's active job. */ }
  return { kind: "discover" };
}

export function useGenerationJob(owner: string | null) {
  const [operation, setOperation] = useState<{ owner: string; value: Operation } | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const locked = useRef(true);

  useEffect(() => {
    setJob(null);
    setError("");
    locked.current = true;
    setBusy(true);
    setOperation(owner ? { owner, value: restore(owner) } : null);
  }, [owner]);

  useEffect(() => {
    if (!owner || operation?.owner !== owner) return;
    const controller = new AbortController();
    let current = operation.value;
    let timer: number;
    const poll = async () => {
      if (controller.signal.aborted) return;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
        const next = current.kind === "create"
          ? await api.createGenerationJob(current.values, current.key, signal)
          : current.kind === "existing"
            ? await api.generationJob(current.jobId, signal)
            : await api.activeGenerationJob(signal);
        if (controller.signal.aborted) return;
        setJob(next);
        setError("");
        if (!next || ["failed", "held", "ready_for_review"].includes(next.status)) {
          store(owner, null);
          locked.current = false;
          setBusy(false);
          if (next?.status === "failed") setError(next.errorDetail ?? "지문 생성에 실패했습니다.");
          return;
        }
        current = { kind: "existing", jobId: next.id };
        store(owner, current);
        timer = window.setTimeout(() => void poll(), 2_000);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && [400, 404, 422].includes(failure.status)) {
          store(owner, null);
          locked.current = false;
          setBusy(false);
          setError(failure.message);
          return;
        }
        setError("작업 상태를 확인할 수 없습니다. 기존 작업에 다시 연결하는 중입니다.");
        timer = window.setTimeout(() => void poll(), 5_000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [owner, operation]);

  const start = (values: GenerationValues) => {
    if (!owner || locked.current) return;
    locked.current = true;
    const value: Operation = { kind: "create", key: crypto.randomUUID(), values: structuredClone(values) };
    store(owner, value);
    setJob(null);
    setBusy(true);
    setError("");
    setOperation({ owner, value });
  };

  return { job, isPending: Boolean(owner) && busy, error, start, clearResult: () => setJob(null) };
}
