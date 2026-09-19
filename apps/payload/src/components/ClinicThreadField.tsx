'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useDocumentInfo, useField } from '@payloadcms/ui'
import './ClinicThreadField.css'

type ThreadRow = {
  id?: string
  role?: 'patient' | 'staff'
  body?: string
  createdAt?: string
}

function rowsFrom(value: unknown): ThreadRow[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is ThreadRow => Boolean(row) && typeof row === 'object')
}

export function ClinicThreadField() {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<ThreadRow[]>({ path: 'thread' })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const messages = useMemo(() => rowsFrom(value), [value])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages.length])

  useEffect(() => {
    if (!id) return undefined
    const tick = window.setInterval(() => {
      void fetch(`/api/unresolved-queries/${id}?depth=0`, { credentials: 'include' })
        .then((response) => (response.ok ? response.json() : null))
        .then((doc: { thread?: ThreadRow[] } | null) => {
          if (Array.isArray(doc?.thread)) setValue(doc.thread)
        })
        .catch(() => {
          /* keep local thread if poll fails */
        })
    }, 8000)
    return () => window.clearInterval(tick)
  }, [id, setValue])

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    if (!id) {
      setError('Save this query once, then you can chat with the patient.')
      return
    }

    setSending(true)
    setError('')
    try {
      const response = await fetch(`/api/chat/clinic-replies/${id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        messages?: ThreadRow[]
        thread?: ThreadRow[]
        message?: string
      }
      if (!response.ok) {
        throw new Error(body.message || `Could not send that reply (HTTP ${response.status}).`)
      }
      if (Array.isArray(body.messages) && body.messages.length > 0) {
        setValue(body.messages)
      } else if (Array.isArray(body.thread)) {
        setValue(body.thread)
      } else {
        setValue([
          ...messages,
          { role: 'staff', body: content, createdAt: new Date().toISOString() },
        ])
      }
      setDraft('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send that reply.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="clinic-thread">
      <div className="clinic-thread-log" ref={log}>
        {messages.length === 0 ? (
          <p className="clinic-thread-empty">No messages yet. The patient question appears after the first save.</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id || `${message.createdAt}-${index}`}
              className={`clinic-thread-bubble${message.role === 'staff' ? ' is-staff' : ''}`}
            >
              <span className="clinic-thread-meta">
                {message.role === 'staff' ? 'Clinic' : 'Patient'}
              </span>
              <p>{message.body}</p>
            </div>
          ))
        )}
      </div>
      <form className="clinic-thread-form" onSubmit={(event) => void send(event)}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Reply to the patient…"
          maxLength={2000}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <p className="clinic-thread-error">{error}</p>}
      <p className="clinic-thread-hint">
        The patient chats on the Clinic replies tab. Their next message will show this query as waiting again.
      </p>
    </div>
  )
}

export default ClinicThreadField
