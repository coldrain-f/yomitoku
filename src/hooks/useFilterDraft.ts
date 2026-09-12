import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { StateSetter } from "../types";

export function useFilterDraft<T>(initialValue: T): {
  draft: T;
  setDraft: StateSetter<T>;
  draftRef: MutableRefObject<T>;
  replaceDraft: (next: T) => void;
} {
  const [draft, setDraft] = useState(initialValue);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const replaceDraft = (next: T) => {
    draftRef.current = next;
    setDraft(next);
  };

  return { draft, setDraft, draftRef, replaceDraft };
}
