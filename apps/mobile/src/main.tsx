import { createRoot } from 'react-dom/client'
import { IonApp, setupIonicReact } from '@ionic/react'
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import './theme.css'
import { AppRouter } from './router/AppRouter'
import { AuthProvider } from './store/AuthContext'

setupIonicReact()

createRoot(document.getElementById('root')!).render(
  <IonApp>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </IonApp>,
)
