import { useEffect, useState } from 'react'
import { baseURL } from '../services/api/client'

type Status = 'checking' | 'online' | 'offline'

/** Shows which API host this build targets and whether it answers a lightweight ping. */
export function ServerStatus() {
  const [status, setStatus] = useState<Status>('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 5000)

    const ping = async () => {
      setStatus('checking')
      setDetail('')
      try {
        const response = await fetch(`${baseURL.replace(/\/$/, '')}/api/access`, {
          method: 'GET',
          signal: controller.signal,
        })
        if (cancelled) return
        // Any HTTP response means the host is reachable (auth may still require login).
        if (response.status > 0) {
          setStatus('online')
          setDetail(`HTTP ${response.status}`)
          return
        }
        setStatus('offline')
        setDetail('Empty response')
      } catch (error) {
        if (cancelled) return
        setStatus('offline')
        setDetail(error instanceof Error ? error.message : 'request failed')
      }
    }

    void ping()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  const label =
    status === 'checking' ? 'Checking…' : status === 'online' ? 'Reachable' : 'Unreachable'

  return (
    <div className={`server-status is-${status}`} role="status">
      <div className="server-status-row">
        <span className="server-status-label">Server</span>
        <span className={`server-status-pill is-${status}`}>{label}</span>
      </div>
      <code className="server-status-url">{baseURL}</code>
      {detail && status !== 'checking' && <p className="server-status-detail">{detail}</p>}
    </div>
  )
}
