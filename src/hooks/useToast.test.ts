import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast";

describe("useToast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a toast after the configured duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(500));

    act(() => {
      result.current.setToast("Saved");
    });
    expect(result.current.toast).toBe("Saved");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.toast).toBe("");
  });

  it("keeps an optional action with the active toast only", () => {
    const { result } = renderHook(() => useToast());
    const onAction = vi.fn();

    act(() => {
      result.current.setToast("Saved", { label: "Undo", onAction });
    });
    expect(result.current.toastAction).toEqual({ label: "Undo", onAction });

    act(() => {
      result.current.setToast("");
    });
    expect(result.current.toastAction).toBeNull();
  });
});
