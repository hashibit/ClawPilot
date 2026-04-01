import { useState, useEffect, useCallback, useRef, DependencyList } from 'react'

interface UseApiOptions<T> {
  /** Called when data loads successfully */
  onSuccess?: (data: T) => void
  /** Called on error, before the error state is set */
  onError?: (err: Error) => void
  /** Don't fetch on mount; only fetch when reload() is called */
  manual?: boolean
}

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  /** Manually trigger a (re-)fetch */
  reload: () => Promise<void>
}

/**
 * Generic data-fetching hook that handles loading and error state.
 *
 * Usage:
 *   const { data, loading, error, reload } = useApi(() => getAgents(opcId), [opcId])
 *
 * The `fn` function is re-called whenever `deps` change (same as useEffect).
 * Pass `manual: true` to skip the initial fetch and call `reload()` yourself.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: DependencyList = [],
  options?: UseApiOptions<T>,
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!options?.manual)
  const [error, setError] = useState<Error | null>(null)

  // Keep latest fn/options in a ref so reload() never goes stale
  const fnRef = useRef(fn)
  const optRef = useRef(options)
  useEffect(() => { fnRef.current = fn }, [fn])
  useEffect(() => { optRef.current = options }, [options])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current()
      setData(result)
      optRef.current?.onSuccess?.(result)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      optRef.current?.onError?.(e)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!options?.manual) reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  return { data, loading, error, reload }
}
