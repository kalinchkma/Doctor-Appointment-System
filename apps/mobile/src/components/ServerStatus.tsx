import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { IonButton } from '@ionic/react'
import { baseURL } from '../services/api/client'

type Status = 'checking' | 'online' | 'offline'

async function pingApi(signal?: AbortSignal): Promise<number> {
  const url = `${baseURL.replace(/\/$/, '')}/api/access`
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      connectTimeout: 5000,
      readTimeout: 5000,
    })
    if (response.status === 0) {
      throw new Error(
        typeof response.data === 'string' && response.data
          ? response.data
          : 'Native HTTP request failed',
      )
    }
    return response.status
  }
  const response = await fetch(url, { method: 'GET', signal })
  return response.status
}

/** Shows which API host this build targets and whether it answers a lightweight ping. */
export function ServerStatus() {
  const [status, setStatus] = useState<Status>('checking')
  const [detail, setDetail] = useState('')
  const generation = useRef(0)

  const check = useCallback(async () => {
    const id = ++generation.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 5000)
    setStatus('checking')
    setDetail('')
    try {
      const httpStatus = await pingApi(controller.signal)
      if (id !== generation.current) return
      if (httpStatus > 0) {
        setStatus('online')
        setDetail(`HTTP ${httpStatus}`)
        return
      }
      setStatus('offline')
      setDetail('Empty response')
    } catch (error) {
      if (id !== generation.current) return
      setStatus('offline')
      setDetail(error instanceof Error ? error.message : 'request failed')
    } finally {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    void check()
    return () => {
      generation.current += 1
    }
  }, [check])

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
      {status === 'offline' && (
        <IonButton
          fill="outline"
          size="small"
          className="server-status-retry"
          onClick={() => void check()}
        >
          Retry
        </IonButton>
      )}
    </div>
  )
}
