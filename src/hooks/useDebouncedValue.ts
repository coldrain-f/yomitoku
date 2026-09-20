import { useEffect, useState } from "react";

/**
 * Keeps inputs responsive while allowing network-backed views to wait for a
 * brief pause before loading new data.
 */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}
