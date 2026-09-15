import { IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import { Login } from '../pages/Login'
import { Register } from '../pages/Register'
import { Home } from '../pages/Home'
import { Doctors } from '../pages/Doctors'
import { DoctorDetails } from '../pages/DoctorDetails'
import { BookAppointment } from '../pages/BookAppointment'
import { BookingConfirmation } from '../pages/BookingConfirmation'
import { MyAppointments } from '../pages/MyAppointments'
import { Chat } from '../pages/Chat'

const protectedRoute = (element: React.ReactNode) => <RequireAuth>{element}</RequireAuth>

export function AppRouter() {
  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/home" element={protectedRoute(<Home />)} />
          <Route path="/doctors" element={protectedRoute(<Doctors />)} />
          <Route path="/doctors/:doctorId" element={protectedRoute(<DoctorDetails />)} />
          <Route path="/doctors/:doctorId/book" element={protectedRoute(<BookAppointment />)} />
          <Route path="/appointments" element={protectedRoute(<MyAppointments />)} />
          <Route
            path="/appointments/:appointmentId/confirmed"
            element={protectedRoute(<BookingConfirmation />)}
          />
          <Route path="/chat" element={protectedRoute(<Chat />)} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </IonRouterOutlet>
    </IonReactRouter>
  )
}
