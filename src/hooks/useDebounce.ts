import { useEffect, useRef, useCallback } from 'react';

/**
 * Returns a debounced version of the callback.
 * The callback is invoked after `delay` ms of inactivity.
 * The returned function also exposes `.flush()` to fire immediately
 * and `.cancel()` to discard a pending invocation.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      cancel();
      callbackRef.current();
    }
  }, [cancel]);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay, cancel],
  ) as T & { flush: () => void; cancel: () => void };

  (debounced as T & { flush: () => void; cancel: () => void }).flush = flush;
  (debounced as T & { flush: () => void; cancel: () => void }).cancel = cancel;

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return debounced;
}
