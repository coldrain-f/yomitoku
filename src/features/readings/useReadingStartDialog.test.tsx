import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DialogConfig } from "../../types";
import { readingItem } from "../../test/fixtures";
import { useReadingStartDialog } from "./useReadingStartDialog";

function renderStartDialog(authenticated: boolean) {
  let dialog: DialogConfig | undefined;
  const openDialog = vi.fn((value: DialogConfig) => {
    dialog = value;
  });
  const startAttempt = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn();
  const onUnauthenticatedStart = vi.fn();
  const closeDialog = vi.fn();
  const showToast = vi.fn();

  const hook = renderHook(() =>
    useReadingStartDialog({
      authenticated,
      closeDialog,
      errorMessage: () => "Failed to start",
      lengthLabel: (length) => length,
      levelLabel: (level) => level,
      navigate,
      onUnauthenticatedStart,
      openDialog,
      showToast,
      startAttempt,
      t: (key) => key,
      topicLabel: (topic) => topic,
    }),
  );

  return {
    ...hook,
    closeDialog,
    getDialog: () => dialog,
    navigate,
    onUnauthenticatedStart,
    openDialog,
    showToast,
    startAttempt,
  };
}

describe("useReadingStartDialog", () => {
  it("redirects an unauthenticated learner through the supplied login flow", () => {
    const { result, onUnauthenticatedStart, openDialog } = renderStartDialog(false);

    act(() => {
      result.current.start(readingItem);
    });

    expect(onUnauthenticatedStart).toHaveBeenCalledWith(readingItem);
    expect(openDialog).not.toHaveBeenCalled();
  });

  it("starts the attempt and moves to the reading route after confirmation", async () => {
    const { result, closeDialog, getDialog, navigate, startAttempt } = renderStartDialog(true);

    act(() => {
      result.current.start(readingItem);
    });

    expect(getDialog()).toMatchObject({
      context: readingItem.title,
      title: "start.begin",
    });

    act(() => {
      getDialog()?.onConfirm?.();
    });

    await waitFor(() => {
      expect(startAttempt).toHaveBeenCalledWith(readingItem);
      expect(navigate).toHaveBeenCalledWith(`/readings/${readingItem.id}`);
    });
    expect(closeDialog).toHaveBeenCalledOnce();
  });
});
