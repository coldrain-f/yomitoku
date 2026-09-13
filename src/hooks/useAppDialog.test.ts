import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppDialog } from "./useAppDialog";

describe("useAppDialog", () => {
  it("clears a previous error whenever a dialog opens or closes", () => {
    const { result } = renderHook(() => useAppDialog());

    act(() => {
      result.current.setDialogError("previous error");
      result.current.openDialog({
        kicker: "Kicker",
        title: "Title",
        description: "Description",
      });
    });

    expect(result.current.dialog?.title).toBe("Title");
    expect(result.current.dialogError).toBe("");

    act(() => {
      result.current.setDialogError("new error");
      result.current.closeDialog();
    });

    expect(result.current.dialog).toBeNull();
    expect(result.current.dialogError).toBe("");
  });
});
