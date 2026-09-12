import { useEffect, useRef, useState } from "react";
import { api, type ReadingListRequest } from "../../lib/api";
import type { ListFilters, ReadingItem } from "../../types";

type ErrorMessage = (error: unknown, fallbackKey: string) => string;

interface ReadingListOptions {
  authenticated: boolean;
  enabled: boolean;
  errorMessage: ErrorMessage;
  filters: ListFilters;
  pageSize: number;
  query: string;
}

function publicSortParameter(
  sort: ListFilters["sort"],
): NonNullable<ReadingListRequest["sort"]> {
  return ({
    "published-desc": "published_desc",
    "published-asc": "published_asc",
    "level-asc": "level_asc",
    "level-desc": "level_desc",
    "perceived-asc": "perceived_level_asc",
    "perceived-desc": "perceived_level_desc",
    "score-asc": "score_asc",
    "score-desc": "score_desc",
  } as const)[sort];
}

export function useReadingList({
  authenticated,
  enabled,
  errorMessage,
  filters,
  pageSize,
  query,
}: ReadingListOptions) {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef(0);

  const load = async (requestedPage = page) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await api.listReadings({
        q: query.trim() || undefined,
        language: filters.language,
        level: filters.level === "all" ? undefined : filters.level,
        length: filters.length === "all" ? undefined : filters.length,
        status:
          !authenticated || filters.status === "all" ? undefined : filters.status,
        time:
          !authenticated || filters.firstSubmissionTime === "all"
            ? undefined
            : filters.firstSubmissionTime,
        bookmarked: authenticated && filters.bookmarked ? true : undefined,
        sort:
          !authenticated && filters.sort.startsWith("score")
            ? "published_desc"
            : publicSortParameter(filters.sort),
        page: requestedPage,
        pageSize,
      });
      if (requestId !== requestRef.current) return;
      setItems((current) =>
        response.items.map((item) => {
          const loaded = current.find((entry) => entry.id === item.id);
          return loaded?.passage
            ? {
                ...item,
                passage: loaded.passage,
                question: loaded.question,
                choices: loaded.choices,
                explanation: loaded.explanation,
              }
            : item;
        }),
      );
      setPage(response.page);
      setTotalPages(response.totalPages);
      setTotalItems(response.totalItems);
    } catch (requestError) {
      if (requestId === requestRef.current) {
        setError(errorMessage(requestError, "list.failed"));
      }
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [authenticated, enabled, filters, page, query]);

  return {
    error,
    isLoading,
    items,
    load,
    page,
    setItems,
    setPage,
    totalItems,
    totalPages,
  };
}
