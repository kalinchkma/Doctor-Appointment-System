import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { IonApp, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonLoading, IonNote, IonPage, IonSpinner, IonText, IonTitle, IonToolbar, setupIonicReact } from '@ionic/react'
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import './theme.css'
import { getDoctors, getSlots, login, register, type Doctor, type AppointmentSlot, type User } from './api'

setupIonicReact()
type Screen = 'home' | 'doctors' | 'details' | 'appointments' | 'chat'
type Mode = 'login' | 'register'

function Header({ title, back }: { title: string; back?: () => void }) {
  return <IonHeader><IonToolbar color="light">{back && <IonButtons slot="start"><IonButton fill="clear" onClick={back} aria-label="Go back">Back</IonButton></IonButtons>}<IonTitle>{title}</IonTitle></IonToolbar></IonHeader>
}

function AuthScreen({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('login'), [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setBusy(true); try { const session = mode === 'login' ? await login(email, password) : await register(name, email, password); localStorage.setItem('payload-token', session.token); onSuccess(session.user) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to continue.') } finally { setBusy(false) } }
  return <IonPage><IonContent className="ion-padding"><main className="auth-shell"><section><p className="eyebrow">CARECONNECT</p><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="intro">Book care with confidence.</p></section><IonCard><IonCardContent><form onSubmit={submit}>{mode === 'register' && <IonItem><IonLabel position="stacked">Full name</IonLabel><IonInput required value={name} onIonInput={e => setName(e.detail.value || '')} /></IonItem>}<IonItem><IonLabel position="stacked">Email address</IonLabel><IonInput type="email" required value={email} onIonInput={e => setEmail(e.detail.value || '')} /></IonItem><IonItem><IonLabel position="stacked">Password</IonLabel><IonInput type="password" required minlength={8} value={password} onIonInput={e => setPassword(e.detail.value || '')} /></IonItem>{error && <IonNote color="danger" className="message">{error}</IonNote>}<IonButton expand="block" type="submit" className="submit">{mode === 'login' ? 'Log in' : 'Register'}</IonButton><IonButton fill="clear" expand="block" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</IonButton></form></IonCardContent></IonCard><IonLoading isOpen={busy} message="Please wait..." /></main></IonContent></IonPage>
}

function Doctors({ onSelect }: { onSelect: (doctor: Doctor) => void }) {
  const [doctors, setDoctors] = useState<Doctor[]>([]), [error, setError] = useState('')
  useEffect(() => { getDoctors().then(setDoctors).catch(e => setError(e.message)) }, [])
  return <IonPage><Header title="Doctors" /><IonContent className="ion-padding">{error && <IonText color="danger">{error}</IonText>}{!error && !doctors.length && <div className="center"><IonSpinner /><p>Add doctors in Payload Admin to see them here.</p></div>}<IonList>{doctors.map(doctor => <IonCard button key={doctor.id} onClick={() => onSelect(doctor)}><IonCardContent><div className="doctor-row"><div className="avatar">{doctor.name.slice(0, 1)}</div><div><strong>{doctor.name}</strong><p>{doctor.specialization}</p></div></div></IonCardContent></IonCard>)}</IonList></IonContent></IonPage>
}

function DoctorDetails({ doctor, back }: { doctor: Doctor; back: () => void }) {
  const [slots, setSlots] = useState<AppointmentSlot[]>([]), [error, setError] = useState('')
  useEffect(() => { getSlots(doctor.id).then(setSlots).catch(e => setError(e.message)) }, [doctor.id])
  return <IonPage><Header title="Doctor details" back={back} /><IonContent className="ion-padding"><section className="profile"><div className="avatar large">{doctor.name.slice(0, 1)}</div><h1>{doctor.name}</h1><p className="specialty">{doctor.specialization}</p><p>{doctor.qualifications || 'Qualifications will be added by the clinic.'}</p><p>{doctor.bio || 'A short doctor biography will appear here.'}</p></section><h2>Available slots</h2>{error && <IonText color="danger">{error}</IonText>}{!error && !slots.length && <IonNote>No available slots yet.</IonNote>}<IonList>{slots.map(slot => <IonItem key={slot.id}><IonLabel><strong>{new Date(slot.date).toLocaleDateString()}</strong><p>{slot.time}</p></IonLabel><IonButton disabled>Book soon</IonButton></IonItem>)}</IonList><IonNote className="message">Booking will be enabled after the protected atomic booking endpoint is added.</IonNote></IonContent></IonPage>
}

function Home({ user, go }: { user: User; go: (screen: Screen) => void }) {
  return <IonPage><Header title="CareConnect" /><IonContent className="ion-padding"><h1>Hello, {user.name}</h1><p className="intro">What would you like to do?</p><div className="menu-grid"><IonButton onClick={() => go('doctors')}>Find a doctor</IonButton><IonButton fill="outline" onClick={() => go('appointments')}>My appointments</IonButton><IonButton fill="outline" onClick={() => go('chat')}>Healthcare chat</IonButton></div></IonContent></IonPage>
}
function Placeholder({ title, back, children }: { title: string; back: () => void; children: string }) { return <IonPage><Header title={title} back={back} /><IonContent className="ion-padding"><IonCard><IonCardContent><h2>{title}</h2><p>{children}</p></IonCardContent></IonCard></IonContent></IonPage> }

function App() { const [user, setUser] = useState<User | null>(null), [screen, setScreen] = useState<Screen>('home'), [doctor, setDoctor] = useState<Doctor | null>(null); if (!user) return <AuthScreen onSuccess={setUser} />; if (screen === 'doctors') return <Doctors onSelect={d => { setDoctor(d); setScreen('details') }} />; if (screen === 'details' && doctor) return <DoctorDetails doctor={doctor} back={() => setScreen('doctors')} />; if (screen === 'appointments') return <Placeholder title="My appointments" back={() => setScreen('home')}>Booked appointments will appear here once the protected booking endpoint is added.</Placeholder>; if (screen === 'chat') return <Placeholder title="Healthcare chat" back={() => setScreen('home')}>This screen is ready to call the future authenticated Payload chat endpoint.</Placeholder>; return <Home user={user} go={setScreen} /> }
createRoot(document.getElementById('root')!).render(<IonApp><App /></IonApp>)
