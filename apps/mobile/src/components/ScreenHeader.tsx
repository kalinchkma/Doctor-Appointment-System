import { IonBackButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/react'

type Props = {
  title: string
  /** Route to fall back to when there is no history, for example after a deep link. */
  backTo?: string
  actions?: React.ReactNode
}

export function ScreenHeader({ title, backTo, actions }: Props) {
  return (
    <IonHeader>
      <IonToolbar color="light">
        {backTo && (
          <IonButtons slot="start">
            <IonBackButton defaultHref={backTo} text="Back" />
          </IonButtons>
        )}
        <IonTitle>{title}</IonTitle>
        {actions && <IonButtons slot="end">{actions}</IonButtons>}
      </IonToolbar>
    </IonHeader>
  )
}
