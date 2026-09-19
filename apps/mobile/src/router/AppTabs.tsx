import { IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import {
  calendarOutline,
  chatbubblesOutline,
  homeOutline,
  mailUnreadOutline,
  searchOutline,
} from 'ionicons/icons'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Home } from '../pages/Home'
import { Doctors } from '../pages/Doctors'
import { DoctorDetails } from '../pages/DoctorDetails'
import { BookAppointment } from '../pages/BookAppointment'
import { BookingConfirmation } from '../pages/BookingConfirmation'
import { AppointmentDetails } from '../pages/AppointmentDetails'
import { MyAppointments } from '../pages/MyAppointments'
import { Chat } from '../pages/Chat'
import { ClinicReplies } from '../pages/ClinicReplies'
import { ClinicReplyThread } from '../pages/ClinicReplyThread'

/**
 * Primary app shell: Home / Doctors / Appointments / Assistant / Clinic replies.
 * Nested flows keep the tab bar visible except during the multi-step book flow and
 * confirmation, where the footer CTA already needs the space.
 */
export function AppTabs() {
  const { pathname } = useLocation()
  const hideTabBar = pathname.includes('/book') || pathname.endsWith('/confirmed')

  return (
    <IonTabs>
      <IonRouterOutlet>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/doctors/:doctorId" element={<DoctorDetails />} />
          <Route path="/doctors/:doctorId/book" element={<BookAppointment />} />
          <Route path="/appointments" element={<MyAppointments />} />
          <Route
            path="/appointments/:appointmentId/confirmed"
            element={<BookingConfirmation />}
          />
          <Route path="/appointments/:appointmentId" element={<AppointmentDetails />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/clinic-replies" element={<ClinicReplies />} />
          <Route path="/clinic-replies/:queryId" element={<ClinicReplyThread />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </IonRouterOutlet>

      <IonTabBar slot="bottom" className={hideTabBar ? 'app-tab-bar is-hidden' : 'app-tab-bar'}>
        <IonTabButton tab="home" href="/home">
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
        <IonTabButton tab="doctors" href="/doctors">
          <IonIcon icon={searchOutline} />
          <IonLabel>Doctors</IonLabel>
        </IonTabButton>
        <IonTabButton tab="appointments" href="/appointments">
          <IonIcon icon={calendarOutline} />
          <IonLabel>Appointments</IonLabel>
        </IonTabButton>
        <IonTabButton tab="chat" href="/chat">
          <IonIcon icon={chatbubblesOutline} />
          <IonLabel>Assistant</IonLabel>
        </IonTabButton>
        <IonTabButton tab="clinic-replies" href="/clinic-replies">
          <IonIcon icon={mailUnreadOutline} />
          <IonLabel>Replies</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  )
}
