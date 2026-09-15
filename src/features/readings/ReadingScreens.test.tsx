import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import { readingItem, readingAttempt, submittedAttempt } from "../../test/fixtures";
import { ReadingScreen, ResultScreen } from "./ReadingScreens";

describe("reading navigation", () => {
  beforeEach(() => localStorage.setItem("yomitoku.ui-locale", "ko"));
  const props = () => ({ item: readingItem, attempt: readingAttempt, result: null, onChoose: vi.fn(), onSubmit: vi.fn(), isSubmitting: false, onAbandon: vi.fn(), onReport: vi.fn(), onTranslate: vi.fn(), onResult: vi.fn(), highlights: [], onCreateHighlight: vi.fn(), onDeleteHighlight: vi.fn() });

  it("moves keyboard selection and keeps one tab stop per question", () => {
    const p = props();
    render(<LocaleProvider><ReadingScreen {...p} /></LocaleProvider>);
    const choices = within(screen.getAllByRole("radiogroup")[0]).getAllByRole("radio");
    expect(choices.map(c => c.tabIndex)).toEqual([0, -1]);
    fireEvent.keyDown(choices[0], {key: "ArrowRight"});
    expect(p.onChoose).toHaveBeenLastCalledWith("question-1", "choice-2");
    expect(document.activeElement).toBe(choices[1]);
    fireEvent.keyDown(choices[1], {key: "ArrowRight"});
    expect(p.onChoose).toHaveBeenLastCalledWith("question-1", "choice-1");
  });

  it("focuses the first unanswered question without submitting", () => {
    const p = props();
    render(<LocaleProvider><ReadingScreen {...p} attempt={{...readingAttempt, answers: readingAttempt.answers.slice(0, 1)}} /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", {name: "제출하기"}));
    expect(p.onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("reading-question-2");
    expect(screen.getByRole("alert").textContent).toContain("문제 2");
  });

  it("opens the selected question's explanation from the result", () => {
    const onReview = vi.fn();
    const result = {...submittedAttempt, item: readingItem, choices: readingItem.choices, questionResults: [...submittedAttempt.questionResults, {...submittedAttempt.questionResults[0], questionId: "question-2", isCorrect: false}]};
    render(<LocaleProvider><ResultScreen result={result} onReview={onReview} onFeedback={vi.fn()} onContinue={vi.fn()} onHome={vi.fn()} /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", {name: /문제 2 .*해설 보기/}));
    expect(onReview).toHaveBeenCalledWith("question-2");
  });
});
