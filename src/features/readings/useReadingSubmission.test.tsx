import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { readingAttempt, readingItem, submittedAttempt } from "../../test/fixtures";
import { useReadingSubmission } from "./useReadingSubmission";

describe("useReadingSubmission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits once and creates a result with the randomized choices", async () => {
    const submitAttempt = vi
      .spyOn(api, "submitAttempt")
      .mockResolvedValue(submittedAttempt);
    const { result } = renderHook(() => useReadingSubmission());

    let pending!: Promise<typeof submittedAttempt | null>;
    act(() => {
      pending = result.current.submitReadingAttempt(readingAttempt, readingItem);
    });

    expect(result.current.isSubmitting).toBe(true);
    expect(await result.current.submitReadingAttempt(readingAttempt, readingItem)).toBeNull();

    await act(async () => {
      await pending;
    });

    expect(submitAttempt).toHaveBeenCalledWith(
      readingAttempt.attemptId,
      readingAttempt.answers,
      readingAttempt.elapsedSeconds,
    );
    expect(result.current.result).toMatchObject({
      itemId: readingItem.id,
      choices: readingAttempt.choices,
      isCorrect: true,
    });
  });

  it("re-enables submission after a failed request", async () => {
    vi.spyOn(api, "submitAttempt").mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useReadingSubmission());

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.submitReadingAttempt(readingAttempt, readingItem);
    });

    await act(async () => {
      await expect(pending).rejects.toThrow("network");
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.submittingRef.current).toBe(false);
  });
});
