import { IonCard, IonCardContent, IonContent, IonPage } from '@ionic/react'
import { ServerStatus } from './ServerStatus'

type Props = {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <main className="auth-shell">
          <section>
            <p className="eyebrow">CARECONNECT</p>
            <h1>{title}</h1>
            <p className="intro">{subtitle}</p>
          </section>
          {/* <ServerStatus /> */}
          <IonCard>
            <IonCardContent>{children}</IonCardContent>
          </IonCard>
        </main>
      </IonContent>
    </IonPage>
  )
}
