"use client";

import { useState, useCallback } from "react";

interface ApiCallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for API calls with automatic loading/error state management.
 * Replaces manual try/catch + console.error patterns.
 *
 * Usage:
 *   const { data, loading, error, execute, reset } = useApiCall(api.projects.list);
 *   useEffect(() => { execute(); }, []);
 */
export function useApiCall<T, Args extends any[] = []>(
  fn: (...args: Args) => Promise<T>
) {
  const [state, setState] = useState<ApiCallState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (e: any) {
        const message = e.message || "An unexpected error occurred";
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [fn]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

/**
 * Simple inline error display component.
 */
export function ApiError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm">
      <p className="text-red-700 dark:text-red-400">⚠️ {error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
