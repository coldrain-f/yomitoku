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
});
