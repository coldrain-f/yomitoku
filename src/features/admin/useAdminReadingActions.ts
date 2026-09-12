import { useCallback, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { Choice, ManualReadingDraft, ReadingItem, ReadingLanguage, Topic } from "../../types";

type ErrorMessage = (error: unknown, fallbackKey: string) => string;

interface AdminReadingActionsOptions {
  createManualDraft: () => ManualReadingDraft;
  errorMessage: ErrorMessage;
  removeAdminItem: (itemId: string) => void;
  replaceAdminItem: (item: ReadingItem) => void;
  validateManualDraft: (draft: ManualReadingDraft) => string | null;
}

export function useAdminReadingActions({
  createManualDraft,
  errorMessage,
  removeAdminItem,
  replaceAdminItem,
  validateManualDraft,
}: AdminReadingActionsOptions) {
  const [draft, setDraft] = useState<ReadingItem | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualReadingDraft>(createManualDraft);
  const [manualError, setManualError] = useState("");
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const adminSavingRef = useRef(false);

  const resetManualDraft = useCallback(() => {
    setManualDraft(createManualDraft());
    setManualError("");
  }, [createManualDraft]);

  const syncDraft = useCallback((item: ReadingItem) => {
    setDraft((current) => (current?.id === item.id ? structuredClone(item) : current));
  }, []);

  const openAdminItem = useCallback(
    async (itemId: string) => {
      const detail = await api.adminReading(itemId);
      replaceAdminItem(detail);
      setDraft(structuredClone(detail));
      return detail;
    },
    [replaceAdminItem],
  );

  const saveAdminItem = useCallback(
    async (item: ReadingItem) => {
      if (adminSavingRef.current) return null;
      adminSavingRef.current = true;
      setIsAdminSaving(true);
      try {
        const next = await api.updateAdminReading(item);
        replaceAdminItem(next);
        setDraft(structuredClone(next));
        return next;
      } finally {
        adminSavingRef.current = false;
        setIsAdminSaving(false);
      }
    },
    [replaceAdminItem],
  );

  const createManualReading = useCallback(async () => {
    const validationError = validateManualDraft(manualDraft);
    if (validationError) {
      setManualError(validationError);
      return null;
    }
    setIsManualSaving(true);
    setManualError("");
    try {
      const next = await api.createAdminReading(manualDraft);
      replaceAdminItem(next);
      setManualDraft(createManualDraft());
      setDraft(structuredClone(next));
      return next;
    } catch (error) {
      setManualError(errorMessage(error, "admin.saveFailed"));
      throw error;
    } finally {
      setIsManualSaving(false);
    }
  }, [createManualDraft, errorMessage, manualDraft, replaceAdminItem, validateManualDraft]);

  const deleteAdminItem = useCallback(
    async (itemId: string) => {
      await api.deleteAdminReading(itemId);
      removeAdminItem(itemId);
    },
    [removeAdminItem],
  );

  const toggleHold = useCallback(
    async (item: ReadingItem) => {
      const next = item.status === "held"
        ? await api.unhold(item.id)
        : await api.hold(item.id);
      replaceAdminItem(next);
      syncDraft(next);
      return next;
    },
    [replaceAdminItem, syncDraft],
  );

  const publishAdminItem = useCallback(
    async (item: ReadingItem) => {
      if (adminSavingRef.current) return null;
      adminSavingRef.current = true;
      setIsAdminSaving(true);
      try {
        const saved = await api.updateAdminReading(item);
        replaceAdminItem(saved);
        setDraft(structuredClone(saved));
        const next = await api.publish(saved.id);
        replaceAdminItem(next);
        syncDraft(next);
        return next;
      } finally {
        adminSavingRef.current = false;
        setIsAdminSaving(false);
      }
    },
    [replaceAdminItem, syncDraft],
  );

  const suggestTitle = useCallback(
    async (passage: string, language: ReadingLanguage) =>
      (await api.suggestAdminTitle(passage, language)).title,
    [],
  );

  const suggestTopic = useCallback(
    async (passage: string, language: ReadingLanguage): Promise<Topic> =>
      (await api.suggestAdminTopic(passage, language)).topic,
    [],
  );

  const suggestExplanation = useCallback(
    async (
      passage: string,
      question: string,
      choices: Choice[],
      language: ReadingLanguage,
    ) => (await api.suggestAdminExplanation(passage, question, choices, language)).explanation,
    [],
  );

  return {
    deleteAdminItem,
    draft,
    isAdminSaving,
    isManualSaving,
    manualDraft,
    manualError,
    openAdminItem,
    publishAdminItem,
    resetManualDraft,
    saveAdminItem,
    saveManualReading: createManualReading,
    setDraft,
    setManualDraft,
    suggestExplanation,
    suggestTitle,
    suggestTopic,
    toggleHold,
  };
}
