import type { Payload, PayloadRequest } from 'payload'

// Derived from the adapter rather than imported from 'mongodb', which is a transitive
// dependency here and should not be pinned directly.
type Session = Payload['db']['sessions'][string]

export type Transaction = {
  /** Null when the deployment cannot offer transactions. */
  readonly id: number | string | null
  readonly session: Session | undefined
  readonly active: boolean
}

/**
 * Payload's mongoose adapter only enables transactions when the client was configured
 * with an explicit `replicaSet`. Connecting with `directConnection=true` — which is what
 * the host-side development mode has to do, because it cannot resolve the Compose
 * hostname the replica set advertises — therefore yields no transaction support.
 *
 * Rather than assuming one or the other, callers begin a transaction and check `active`.
 * Booking stays correct in both modes: with a transaction the database rolls back, and
 * without one the caller compensates explicitly.
 */
export async function begin(req: PayloadRequest): Promise<Transaction> {
  const id = await req.payload.db.beginTransaction()

  if (id === null || id === undefined) {
    return { id: null, session: undefined, active: false }
  }

  req.transactionID = id
  return { id, session: req.payload.db.sessions[id], active: true }
}

export async function commit(req: PayloadRequest, transaction: Transaction): Promise<void> {
  if (transaction.active && transaction.id !== null) {
    await req.payload.db.commitTransaction(transaction.id)
  }
  delete req.transactionID
}

export async function rollback(req: PayloadRequest, transaction: Transaction): Promise<void> {
  if (transaction.active && transaction.id !== null) {
    await req.payload.db.rollbackTransaction(transaction.id)
  }
  delete req.transactionID
}
