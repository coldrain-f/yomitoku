import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import type { ReadingResult } from "../../types";
import { readingAttempt, readingItem } from "../../test/fixtures";
import { ReadingScreen, ResultScreen } from "./ReadingScreens";

describe("ResultScreen", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("makes the number of correct answers the primary result", () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");
    const result: ReadingResult = {
      itemId: readingItem.id,
      item: readingItem,
      choices: readingItem.choices,
      selectedChoiceId: "choice-1",
      correctChoiceId: "choice-1",
      isCorrect: false,
      elapsedSeconds: 42,
      explanation: "",
      selectedChoiceWrongExplanation: null,
      itemAccuracy: 80,
      challengerCount: 10,
      questionResults: [
        {
          questionId: "question-1",
          isCorrect: true,
          selectedChoiceId: "choice-1",
          correctChoiceId: "choice-1",
          explanation: "",
          selectedChoiceWrongExplanation: null,
        },
        {
          questionId: "question-2",
          isCorrect: false,
          selectedChoiceId: "choice-3",
          correctChoiceId: "choice-4",
          explanation: "",
          selectedChoiceWrongExplanation: null,
        },
      ],
    };

    render(
      <LocaleProvider>
        <ResultScreen
          result={result}
          onFeedback={vi.fn()}
          onReview={vi.fn()}
          onContinue={vi.fn()}
          onHome={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText("문제 1 정답")).toBeTruthy();
    expect(screen.getByText("문제 2 오답")).toBeTruthy();
  });

  it("selects answers with arrow keys using radio-group behavior", () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");
    const onChoose = vi.fn();

    render(
      <LocaleProvider>
        <ReadingScreen
          item={readingItem}
          attempt={readingAttempt}
          result={null}
          onChoose={onChoose}
          onSubmit={vi.fn()}
          isSubmitting={false}
          onAbandon={vi.fn()}
          onReport={vi.fn()}
          onTranslate={vi.fn()}
          onResult={vi.fn()}
          highlights={[]}
          onCreateHighlight={vi.fn().mockResolvedValue({})}
          onDeleteHighlight={vi.fn().mockResolvedValue(undefined)}
        />
      </LocaleProvider>,
    );

    const firstGroup = screen.getAllByRole("radiogroup")[0];
    const choices = screen.getAllByRole("radio", { name: /선택지/ });
    choices[0].focus();
    fireEvent.keyDown(choices[0], { key: "ArrowRight" });

    expect(firstGroup.contains(document.activeElement)).toBe(true);
    expect(onChoose).toHaveBeenCalledWith("question-1", "choice-2");
  });
});
