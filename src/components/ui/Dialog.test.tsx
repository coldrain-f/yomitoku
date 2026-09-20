import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import { Dialog } from "./Dialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      <Dialog
        dialog={open ? {
          kicker: "확인",
          title: "저장할까요?",
          description: "내용을 저장합니다.",
          confirmLabel: "저장",
          onConfirm: () => undefined,
        } : null}
        onClose={() => setOpen(false)}
      >
        <p>추가 내용</p>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("moves focus into the dialog, traps Tab, and restores the trigger", async () => {
    render(
      <LocaleProvider>
        <DialogHarness />
      </LocaleProvider>,
    );
    const trigger = screen.getByRole("button", { name: "열기" });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "닫기" });
    const confirm = screen.getByRole("button", { name: "저장" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.click(close);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
