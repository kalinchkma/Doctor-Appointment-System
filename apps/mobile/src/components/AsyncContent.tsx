import { IonButton, IonSpinner, IonText } from '@ionic/react'

type Props = {
  loading: boolean
  error: string | null
  empty?: boolean
  emptyMessage?: string
  onRetry?: () => void
  children: React.ReactNode
}

/**
 * Every data-backed screen has the same four states. Centralising them keeps the
 * assignment's "understandable error messages rather than failing silently" requirement
 * from depending on each screen remembering to handle them.
 */
export function AsyncContent({
  loading,
  error,
  empty,
  emptyMessage = 'Nothing to show yet.',
  onRetry,
  children,
}: Props) {
  if (loading) {
    return (
      <div className="state-block">
        <IonSpinner />
        <p>Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-block">
        <IonText color="danger">
          <p>{error}</p>
        </IonText>
        {onRetry && (
          <IonButton fill="outline" size="small" onClick={onRetry}>
            Try again
          </IonButton>
        )}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="state-block">
        <p>{emptyMessage}</p>
        {onRetry && (
          <IonButton fill="clear" size="small" onClick={onRetry}>
            Refresh
          </IonButton>
        )}
      </div>
    )
  }

  return <>{children}</>
}
