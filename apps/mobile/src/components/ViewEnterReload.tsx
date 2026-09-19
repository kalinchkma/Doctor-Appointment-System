import { useIonViewWillEnter } from '@ionic/react'

/**
 * Ionic keeps tab pages mounted, so mount-only fetches go stale. This must sit
 * inside IonPage so the view-enter lifecycle fires when the user comes back.
 */
export function ViewEnterReload({ onEnter }: { onEnter: () => void }) {
  useIonViewWillEnter(() => {
    onEnter()
  }, [onEnter])
  return null
}
