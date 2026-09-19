import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api/client'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function messageFor(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message
  if (reason instanceof Error) return reason.message
  return 'Something went wrong. Please try again.'
}

/**
 * Loads data on mount and exposes loading, error, and reload so every screen can render
 * the same four states. Booking conflicts in particular need a cheap way to refresh.
 *
 * Reload keeps the last good payload on screen so tab switches and ionViewWillEnter
 * do not flash an empty loading state.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [nonce, setNonce] = useState(0)
  const [settled, setSettled] = useState<{
    requestKey: string
    data: T | null
    error: string | null
  }>({
    requestKey: '',
    data: null,
    error: null,
  })

  const requestKey = `${nonce}:${JSON.stringify(deps)}`
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    loader()
      .then((data) => {
        if (!cancelled) setSettled({ requestKey, data, error: null })
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSettled((previous) => ({
            requestKey,
            data: previous.data,
            error: previous.data ? null : messageFor(reason),
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [requestKey, loader])

  const current = settled.requestKey === requestKey

  return {
    data: settled.data,
    loading: !current && settled.data == null,
    error: current ? settled.error : settled.data ? null : settled.error,
    reload,
  }
}
