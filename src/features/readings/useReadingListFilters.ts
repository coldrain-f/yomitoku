import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { readStoredFilters, storeFilters } from "../../lib/filterStorage";
import { defaultGenerationLanguage } from "../../lib/readingPolicy";
import type { ListFilters, ReadingLanguage } from "../../types";

const storageKey = "yomitoku.list-filters";

const defaultFilters: ListFilters = {
  language: defaultGenerationLanguage,
  bookmarked: false,
  level: "all",
  length: "all",
  status: "all",
  firstSubmissionTime: "all",
  sort: "published-desc",
};

function normalizeReadingLanguage(value: unknown): ReadingLanguage {
  return value === "ko" ? "ko" : defaultGenerationLanguage;
}

function normalizeLearningResultFilter(value: unknown): ListFilters["status"] {
  return ["all", "unstarted", "wrong", "score-100", "score-90", "score-80"].includes(
    value as string,
  )
    ? value as ListFilters["status"]
    : "all";
}

function normalizeFirstSubmissionTimeFilter(
  value: unknown,
): ListFilters["firstSubmissionTime"] {
  return ["all", "on-time", "timed-out"].includes(value as string)
    ? value as ListFilters["firstSubmissionTime"]
    : "all";
}

interface UseReadingListFiltersOptions {
  resetPage: () => void;
}

export function useReadingListFilters({
  resetPage,
}: UseReadingListFiltersOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const storedFilters = useMemo(
    () => readStoredFilters(storageKey, defaultFilters),
    [searchParams],
  );
  const filters = useMemo<ListFilters>(
    () => ({
      language: normalizeReadingLanguage(
        searchParams.get("language") ?? storedFilters.language,
      ),
      bookmarked: searchParams.has("bookmarked")
        ? searchParams.get("bookmarked") === "true"
        : Boolean(storedFilters.bookmarked),
      level:
        (searchParams.get("level") as ListFilters["level"] | null) ??
        storedFilters.level,
      length:
        (searchParams.get("length") as ListFilters["length"] | null) ??
        storedFilters.length,
      status: normalizeLearningResultFilter(
        searchParams.get("status") ?? storedFilters.status,
      ),
      firstSubmissionTime: normalizeFirstSubmissionTimeFilter(
        searchParams.get("time") ?? storedFilters.firstSubmissionTime,
      ),
      sort:
        (searchParams.get("sort") as ListFilters["sort"] | null) ??
        storedFilters.sort,
    }),
    [searchParams, storedFilters],
  );
  const query = searchParams.get("q") ?? "";

  const writeParams = useCallback(
    (
      next: ListFilters & { query: string },
      { replace = false }: { replace?: boolean } = {},
    ) => {
      storeFilters(storageKey, {
        language: next.language,
        bookmarked: next.bookmarked,
        level: next.level,
        length: next.length,
        status: next.status,
        firstSubmissionTime: next.firstSubmissionTime,
        sort: next.sort,
      });
      const params = new URLSearchParams();
      if (next.query) params.set("q", next.query);
      params.set("language", next.language);
      if (next.bookmarked) params.set("bookmarked", "true");
      if (next.level !== "all") params.set("level", next.level);
      if (next.length !== "all") params.set("length", next.length);
      if (next.status !== "all") params.set("status", next.status);
      if (next.firstSubmissionTime !== "all") {
        params.set("time", next.firstSubmissionTime);
      }
      if (next.sort !== "published-desc") params.set("sort", next.sort);
      setSearchParams(params, { replace });
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (next: ListFilters) => {
      resetPage();
      writeParams({ ...next, query });
    },
    [query, resetPage, writeParams],
  );
  const setQuery = useCallback(
    (nextQuery: string) => {
      resetPage();
      writeParams({ ...filters, query: nextQuery }, { replace: true });
    },
    [filters, resetPage, writeParams],
  );
  const clearBookmarkFilter = useCallback(() => {
    if (filters.bookmarked) {
      writeParams({ ...filters, bookmarked: false, query });
    }
  }, [filters, query, writeParams]);

  return {
    clearBookmarkFilter,
    filters,
    query,
    setFilters,
    setQuery,
  };
}
