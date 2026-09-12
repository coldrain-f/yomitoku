import { useRef, useState } from "react";
import { api } from "../../lib/api";
import type {
  HighlightCollectionPage,
  ReadingLanguage,
} from "../../types";

type ErrorMessage = (error: unknown, fallbackKey: string) => string;

export const highlightCollectionPageSize = 5;

export const emptyHighlightCollection: HighlightCollectionPage = {
  items: [],
  page: 1,
  pageSize: highlightCollectionPageSize,
  totalItems: 0,
  totalPages: 1,
};

export function useHighlightCollection(errorMessage: ErrorMessage) {
  const [collection, setCollection] = useState<HighlightCollectionPage>(
    emptyHighlightCollection,
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<"all" | ReadingLanguage>("all");
  const [query, setQuery] = useState("");
  const [removingHighlightId, setRemovingHighlightId] = useState<string | null>(
    null,
  );
  const requestRef = useRef(0);

  const reset = () => {
    requestRef.current += 1;
    setCollection(emptyHighlightCollection);
    setError("");
    setIsLoading(false);
    setLanguage("all");
    setQuery("");
    setRemovingHighlightId(null);
  };

  const load = ({
    language: nextLanguage = language,
    query: nextQuery = query,
    page = collection.page,
  }: {
    language?: "all" | ReadingLanguage;
    query?: string;
    page?: number;
  } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setError("");
    setIsLoading(true);
    return api
      .highlightCollection({
        language: nextLanguage === "all" ? undefined : nextLanguage,
        query: nextQuery.trim() || undefined,
        page,
        pageSize: highlightCollectionPageSize,
      })
      .then((nextCollection) => {
        if (requestRef.current === requestId) setCollection(nextCollection);
      })
      .catch((requestError: unknown) => {
        if (requestRef.current === requestId) {
          setError(errorMessage(requestError, "highlights.failed"));
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) setIsLoading(false);
      });
  };

  const open = () => {
    reset();
    return load({ language: "all", query: "", page: 1 });
  };

  const remove = async (itemId: string, highlightId: string) => {
    if (removingHighlightId) return false;
    setRemovingHighlightId(highlightId);
    setError("");
    try {
      await api.deleteHighlight(itemId, highlightId);
      setCollection((current) => {
        const removedGroup = current.items.find(
          (item) =>
            item.readingItemId === itemId &&
            item.highlights.some((highlight) => highlight.id === highlightId),
        );
        const items = current.items.flatMap((item) => {
          if (item.readingItemId !== itemId) return [item];
          const highlights = item.highlights.filter(
            (highlight) => highlight.id !== highlightId,
          );
          return highlights.length ? [{ ...item, highlights }] : [];
        });
        const totalItems = Math.max(
          0,
          current.totalItems - (removedGroup?.highlights.length === 1 ? 1 : 0),
        );
        return {
          ...current,
          items,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / current.pageSize)),
        };
      });
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError, "highlights.removeFailed"));
      return false;
    } finally {
      setRemovingHighlightId(null);
    }
  };

  return {
    collection,
    error,
    isLoading,
    language,
    load,
    open,
    query,
    remove,
    removingHighlightId,
    reset,
    setLanguage,
    setQuery,
  };
}
