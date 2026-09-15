import { IonContent, IonPage, IonSpinner } from '@ionic/react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Client-side gating is a UX concern only. Every protected read and write is also
 * enforced by Payload access control, so a tampered client gains nothing.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, restoring } = useAuth()

  if (restoring) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="state-block">
            <IonSpinner />
          </div>
        </IonContent>
      </IonPage>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
