import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import type { StateSetter, ReadingItem } from "../../types";
import { readingItem } from "../../test/fixtures";
import { useReadingAttempt } from "./useReadingAttempt";

describe("useReadingAttempt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("stores answers for every question in the browser session", async () => {
    vi.spyOn(api, "reading").mockResolvedValue(readingItem);
    vi.spyOn(api, "startAttempt").mockResolvedValue({
      id: "attempt-1",
      itemId: readingItem.id,
      startedAt: "2026-01-01T00:00:00.000Z",
      choices: readingItem.choices,
      questions: readingItem.questions,
    });
    const setItems = vi.fn() as unknown as StateSetter<ReadingItem[]>;
    const { result } = renderHook(() =>
      useReadingAttempt({
        authenticated: true,
        authLoading: false,
        isReading: false,
        userId: "user-1",
        pathname: "/",
        setItems,
        loadPassageHighlights: vi.fn().mockResolvedValue(undefined),
        onAttemptStarted: vi.fn(),
        onAttemptRestored: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startAttempt(readingItem);
    });
    act(() => {
      result.current.chooseAnswer("question-2", "choice-4");
    });

    await waitFor(() => {
      const stored = window.sessionStorage.getItem("yomitoku.reading-session:user-1");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? "{}").answers).toEqual([
        { questionId: "question-1", selectedChoiceId: null },
        { questionId: "question-2", selectedChoiceId: "choice-4" },
      ]);
    });
  });
});
