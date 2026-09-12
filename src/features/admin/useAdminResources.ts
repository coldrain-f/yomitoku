import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  api,
  type AdminReadingListRequest,
  type GenerationJobHistory,
  type GenerationModelOptions,
} from "../../lib/api";
import type { AdminFilters, GenerationValues, ReadingItem } from "../../types";

type ErrorMessage = (error: unknown, fallbackKey: string) => string;

interface AdminReadingListOptions {
  enabled: boolean;
  defaultFilters: AdminFilters;
  errorMessage: ErrorMessage;
  normalizeFilters?: (filters: AdminFilters) => AdminFilters;
  pageSize: number;
  storageKey: string;
}

function adminSortParameter(
  sort: AdminFilters["sort"],
): NonNullable<AdminReadingListRequest["sort"]> {
  return ({
    "updated-desc": "updated_desc",
    "updated-asc": "updated_asc",
    "created-desc": "created_desc",
    "created-asc": "created_asc",
    "title-asc": "title_asc",
    "level-asc": "level_asc",
    "level-desc": "level_desc",
    "perceived-asc": "perceived_level_asc",
    "perceived-desc": "perceived_level_desc",
    "status-asc": "status_asc",
  } as const)[sort];
}

function readStoredFilters<T extends object>(key: string, fallback: T): T {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

function storeFilters(key: string, filters: object) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Filter controls remain usable when browser storage is unavailable.
  }
}

export function useAdminReadingList({
  enabled,
  defaultFilters,
  errorMessage,
  normalizeFilters = (filters) => filters,
  pageSize,
  storageKey,
}: AdminReadingListOptions) {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AdminFilters>(() =>
    normalizeFilters(readStoredFilters(storageKey, defaultFilters)),
  );
  const requestRef = useRef(0);

  const load = async (requestedPage = page) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await api.listAdminReadings({
        q: query.trim() || undefined,
        language: filters.language,
        level: filters.level === "all" ? undefined : filters.level,
        length: filters.length === "all" ? undefined : filters.length,
        topic: filters.topic === "all" ? undefined : filters.topic,
        status: filters.status === "all" ? undefined : filters.status,
        sort: adminSortParameter(filters.sort),
        page: requestedPage,
        pageSize,
      });
      if (requestId !== requestRef.current) return;
      setItems(response.items);
      setPage(response.page);
      setTotalPages(response.totalPages);
      setTotalItems(response.totalItems);
      setLoaded(true);
    } catch (requestError) {
      if (requestId === requestRef.current) {
        setError(errorMessage(requestError, "admin.listLoadFailed"));
      }
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  };

  const replaceItem = (next: ReadingItem) =>
    setItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current],
    );

  useEffect(() => {
    storeFilters(storageKey, filters);
  }, [filters, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, filters, page, query]);

  return {
    error,
    filters,
    isLoading,
    items,
    loaded,
    page,
    query,
    replaceItem,
    setFilters,
    setItems,
    setPage,
    setQuery,
    totalItems,
    totalPages,
    load,
  };
}

interface GenerationResourcesOptions {
  errorMessage: ErrorMessage;
  setGeneration: Dispatch<SetStateAction<GenerationValues>>;
}

export function useGenerationResources({
  errorMessage,
  setGeneration,
}: GenerationResourcesOptions) {
  const [models, setModels] = useState<GenerationModelOptions | null>(null);
  const [modelsError, setModelsError] = useState("");
  const [history, setHistory] = useState<GenerationJobHistory[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalItems, setHistoryTotalItems] = useState(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadModels = async () => {
    setModelsError("");
    try {
      const modelOptions = await api.generationModelOptions();
      setModels(modelOptions);
      setGeneration((current) => ({
        ...current,
        generatorModel: modelOptions.models.includes(current.generatorModel)
          ? current.generatorModel
          : modelOptions.defaultGeneratorModel,
        validatorModel: modelOptions.models.includes(current.validatorModel)
          ? current.validatorModel
          : modelOptions.defaultValidatorModel,
      }));
    } catch (requestError) {
      setModels(null);
      setModelsError(errorMessage(requestError, "admin.modelsLoadFailed"));
    }
  };

  const loadHistory = async (page = 1) => {
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await api.generationJobs(page);
      setHistory(response.items);
      setHistoryPage(response.page);
      setHistoryTotalPages(response.totalPages);
      setHistoryTotalItems(response.totalItems);
    } catch (requestError) {
      setHistoryError(errorMessage(requestError, "admin.historyLoadFailed"));
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return {
    history,
    historyError,
    historyPage,
    historyTotalItems,
    historyTotalPages,
    isHistoryLoading,
    loadHistory,
    loadModels,
    models,
    modelsError,
  };
}
