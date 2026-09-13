import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import type { PassageHighlight } from "../../types";
import { PassageHighlighter } from "./PassageHighlighter";

const passage = "지문에서 핵심 문장을 찾습니다.";

function renderHighlighter() {
  return render(
    <LocaleProvider>
      <PassageHighlighter
        passage={passage}
        highlights={[]}
        onCreateHighlight={vi.fn().mockResolvedValue({} as PassageHighlight)}
        onDeleteHighlight={vi.fn().mockResolvedValue(undefined)}
      />
    </LocaleProvider>,
  );
}

function selectPassageText(startOffset: number, endOffset: number) {
  const element = screen.getByText(passage);
  const text = element.firstChild;
  if (!text) throw new Error("Passage text node is missing.");
  const range = document.createRange();
  range.setStart(text, startOffset);
  range.setEnd(text, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  vi.runAllTimers();
}

describe("PassageHighlighter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 20,
        left: 20,
        right: 120,
        top: 80,
        width: 100,
        x: 20,
        y: 80,
        toJSON: () => ({}),
      }),
    });
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  });

  it("enables the floating action after a mobile text selection", () => {
    renderHighlighter();

    act(() => {
      selectPassageText(0, 2);
    });

    const action = screen.getByRole("button", { name: "선택한 글자 하이라이트하기" });
    expect(action.getAttribute("disabled")).toBeNull();
  });

  it("disables the floating action when the selection is cleared", () => {
    renderHighlighter();
    act(() => {
      selectPassageText(0, 2);
    });

    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
      vi.runAllTimers();
    });

    const action = screen.getByRole("button", { name: "글자를 선택하면 하이라이트할 수 있습니다" });
    expect(action.getAttribute("disabled")).not.toBeNull();
  });

  it("disables the floating action immediately after tapping elsewhere", () => {
    renderHighlighter();
    act(() => {
      selectPassageText(0, 2);
    });

    fireEvent.pointerDown(document.body);

    const action = screen.getByRole("button", { name: "글자를 선택하면 하이라이트할 수 있습니다" });
    expect(action.getAttribute("disabled")).not.toBeNull();
  });
});
