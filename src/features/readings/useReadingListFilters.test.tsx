import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReadingListFilters } from "./useReadingListFilters";

function renderFilters(initialEntry: string) {
  const resetPage = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
  return {
    resetPage,
    ...renderHook(() => useReadingListFilters({ resetPage }), { wrapper }),
  };
}

describe("useReadingListFilters", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads URL filters and persists applied filters", () => {
    const { resetPage, result } = renderFilters(
      "/?q=%EB%8F%99%EB%AC%BC&language=ko&bookmarked=true&sort=score-desc",
    );

    expect(result.current).toMatchObject({
      filters: {
        language: "ko",
        bookmarked: true,
        sort: "score-desc",
      },
      query: "동물",
    });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        length: "medium",
      });
    });

    expect(resetPage).toHaveBeenCalledOnce();
    expect(result.current.filters.length).toBe("medium");
    expect(JSON.parse(window.sessionStorage.getItem("yomitoku.list-filters") ?? "{}"))
      .toMatchObject({
        language: "ko",
        bookmarked: true,
        length: "medium",
        sort: "score-desc",
      });
  });

  it("restarts pagination when the search query changes", () => {
    const { resetPage, result } = renderFilters("/?language=ja");

    act(() => {
      result.current.setQuery("고양이");
    });

    expect(resetPage).toHaveBeenCalledOnce();
    expect(result.current.query).toBe("고양이");
  });
});
