import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { LocaleProvider } from "../../lib/i18n";
import { AdminItemResponsesDialog } from "./AdminItemResponsesDialog";

describe("AdminItemResponsesDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("shows evaluation and report pages independently", async () => {
    window.localStorage.setItem("yomitoku.ui-locale", "ko");
    vi.spyOn(api, "adminItemFeedback").mockResolvedValue({
      items: [{
        id: "feedback-1",
        qualityRating: 4,
        perceivedLevel: "N2",
        comment: "근거가 분명합니다.",
        updatedAt: "2026-09-13T00:00:00.000Z",
      }],
      page: 1,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    });
    vi.spyOn(api, "adminItemReports").mockResolvedValue({
      items: [{
        id: "report-1",
        content: "해설을 확인해 주세요.",
        status: "open",
        createdAt: "2026-09-12T00:00:00.000Z",
      }],
      page: 1,
      pageSize: 5,
      totalItems: 1,
      totalPages: 1,
    });

    render(
      <LocaleProvider>
        <AdminItemResponsesDialog
          itemId="item-1"
          evaluationCount={6}
          reportCount={1}
        />
      </LocaleProvider>,
    );

    expect(await screen.findByText("근거가 분명합니다.")).toBeTruthy();
    expect(screen.getByText("평가 6명 · 1 / 2페이지")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "오류 제보 1건" }));

    expect(await screen.findByText("해설을 확인해 주세요.")).toBeTruthy();
    expect(screen.getByText("접수됨")).toBeTruthy();
  });
});
