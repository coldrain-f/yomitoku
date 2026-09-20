import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for input to settle before publishing the next value", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "ja" } },
    );

    rerender({ value: "japan" });
    expect(result.current).toBe("ja");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("japan");
  });
});
