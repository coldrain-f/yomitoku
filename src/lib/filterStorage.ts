export function readStoredFilters<T extends object>(key: string, fallback: T): T {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

export function storeFilters(key: string, filters: object) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Filter controls remain usable when browser storage is unavailable.
  }
}
