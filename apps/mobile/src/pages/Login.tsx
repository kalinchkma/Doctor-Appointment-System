import { useState, type FormEvent } from 'react'
import { IonButton, IonInput, IonLoading, IonNote } from '@ionic/react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../hooks/useAuth'
import { messageFor } from '../hooks/useAsync'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/home', { replace: true })
    } catch (reason) {
      setError(messageFor(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Book care with confidence.">
      <form onSubmit={submit}>
        <IonInput
          fill="outline"
          label="Email address"
          labelPlacement="stacked"
          type="email"
          autocomplete="email"
          required
          value={email}
          onIonInput={(event) => setEmail(event.detail.value ?? '')}
        />
        <IonInput
          fill="outline"
          label="Password"
          labelPlacement="stacked"
          type="password"
          autocomplete="current-password"
          required
          value={password}
          onIonInput={(event) => setPassword(event.detail.value ?? '')}
        />
        {error && (
          <IonNote color="danger" className="message">
            {error}
          </IonNote>
        )}
        <IonButton expand="block" type="submit" className="submit" disabled={busy}>
          Log in
        </IonButton>
        <IonButton fill="clear" expand="block" type="button" onClick={() => navigate('/register')}>
          New here? Create an account
        </IonButton>
      </form>
      <IonLoading isOpen={busy} message="Signing you in…" />
    </AuthLayout>
  )
}
