import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/react'
import { calendarOutline, chatbubblesOutline, logOutOutline, searchOutline } from 'ionicons/icons'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAuth } from '../hooks/useAuth'

export function Home() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <IonPage>
      <ScreenHeader
        title="CareConnect"
        actions={
          <IonButton onClick={signOut} aria-label="Log out">
            <IonIcon slot="icon-only" icon={logOutOutline} />
          </IonButton>
        }
      />
      <IonContent className="ion-padding">
        <h1>Hello, {user?.name}</h1>
        <p className="intro">What would you like to do?</p>
        <div className="menu-grid">
          <IonButton onClick={() => navigate('/doctors')}>
            <IonIcon slot="start" icon={searchOutline} />
            Find a doctor
          </IonButton>
          <IonButton fill="outline" onClick={() => navigate('/appointments')}>
            <IonIcon slot="start" icon={calendarOutline} />
            My appointments
          </IonButton>
          <IonButton fill="outline" onClick={() => navigate('/chat')}>
            <IonIcon slot="start" icon={chatbubblesOutline} />
            Healthcare assistant
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  )
}
