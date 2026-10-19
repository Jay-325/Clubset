import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stopped changing for `delayMs`.
 *
 * Search boxes use this so the input stays instant while the value that drives
 * a network request only changes when the student pauses. Without it every
 * keystroke fires a fresh `search_clubs` RPC and leaves the previous one to be
 * discarded.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
