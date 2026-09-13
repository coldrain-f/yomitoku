import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import type { Statistics } from "../../lib/api";
import { StatsScreen } from "./StatsScreen";

const statistics: Statistics = {
  completedCount: 1,
  totalGeneratedCount: 2,
  accuracy: 100,
  averageElapsedSeconds: 42,
  byLength: [],
  byLevel: [],
};

describe("StatsScreen", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("identifies statistics using the selected reading language", () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");

    render(
      <LocaleProvider>
        <StatsScreen statistics={statistics} language="ja" />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "일본어 학습 통계" })).toBeTruthy();
  });
});
