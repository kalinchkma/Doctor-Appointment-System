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
 * State is tagged with the request it belongs to and `loading` is derived by comparing
 * that tag to the current request, rather than being reset from inside the effect. That
 * keeps the reset out of the render path and means a stale response can never be shown
 * against newer inputs.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [nonce, setNonce] = useState(0)
  const [settled, setSettled] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  })

  const key = `${nonce}:${JSON.stringify(deps)}`
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    loader()
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setSettled({ key, data: null, error: messageFor(reason) })
      })

    return () => {
      cancelled = true
    }
  }, [key, loader])

  const current = settled.key === key

  return {
    data: current ? settled.data : null,
    loading: !current,
    error: current ? settled.error : null,
    reload,
  }
}
