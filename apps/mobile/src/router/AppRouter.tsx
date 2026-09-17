import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import { AppTabs } from './AppTabs'
import { Login } from '../pages/Login'
import { Register } from '../pages/Register'

export function AppRouter() {
  return (
    <IonReactRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppTabs />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </IonReactRouter>
  )
}
