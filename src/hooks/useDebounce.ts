/** Debounced callback hook with `flush` and `cancel` — used for auto-save. */
import { useEffect, useRef, useCallback } from 'react';

/**
 * Returns a debounced callback plus `flush` and `cancel` controls.
 *
 * - `debounced(...args)` schedules the callback after `delay` ms of inactivity.
 *   Subsequent calls within the window cancel the previous timer.
 * - `flush()` fires the most recent pending callback immediately (no-op if nothing pending).
 * - `cancel()` discards any pending invocation.
 *
 * The latest `callback` is always invoked, even if it changed between scheduling and firing.
 */
export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const lastArgsRef = useRef<Parameters<T> | null>(null);

  // Keep `callbackRef` in sync with the latest callback without writing during render.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current && lastArgsRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const args = lastArgsRef.current;
      lastArgsRef.current = null;
      callbackRef.current(...args);
    }
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      lastArgsRef.current = args;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const fnArgs = lastArgsRef.current;
        lastArgsRef.current = null;
        if (fnArgs) callbackRef.current(...fnArgs);
      }, delay);
    },
    [delay],
  );

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return { debounced, flush, cancel };
}
