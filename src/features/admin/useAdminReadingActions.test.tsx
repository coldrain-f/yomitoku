import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { manualReadingDraft, readingItem } from "../../test/fixtures";
import { useAdminReadingActions } from "./useAdminReadingActions";

function renderActions(validateManualDraft: () => string | null = () => null) {
  return renderHook(() =>
    useAdminReadingActions({
      createManualDraft: () => structuredClone(manualReadingDraft),
      errorMessage: () => "저장에 실패했습니다.",
      removeAdminItem: vi.fn(),
      replaceAdminItem: vi.fn(),
      validateManualDraft,
    }),
  );
}

describe("useAdminReadingActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a validation error without sending an invalid manual draft", async () => {
    const createAdminReading = vi.spyOn(api, "createAdminReading");
    const { result } = renderActions(() => "제목을 입력해 주세요.");

    await act(async () => {
      await expect(result.current.saveManualReading()).resolves.toBeNull();
    });

    expect(createAdminReading).not.toHaveBeenCalled();
    expect(result.current.manualError).toBe("제목을 입력해 주세요.");
  });

  it("releases the save lock after a failed update", async () => {
    vi.spyOn(api, "updateAdminReading").mockRejectedValue(new Error("network"));
    const { result } = renderActions();

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.saveAdminItem(readingItem);
    });
    expect(result.current.isAdminSaving).toBe(true);

    await act(async () => {
      await expect(pending).rejects.toThrow("network");
    });
    expect(result.current.isAdminSaving).toBe(false);
    await expect(result.current.saveAdminItem(readingItem)).rejects.toThrow("network");
  });
});
