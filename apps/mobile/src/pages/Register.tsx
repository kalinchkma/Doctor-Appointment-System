import { useState, type FormEvent } from 'react'
import { IonButton, IonInput, IonLoading, IonNote } from '@ionic/react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../hooks/useAuth'
import { messageFor } from '../hooks/useAsync'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    // Checked here for a fast, friendly message; the server enforces the same rule.
    if (password.length < 8) {
      setError('Please choose a password with at least 8 characters.')
      return
    }

    setBusy(true)
    try {
      await register(name.trim(), email.trim(), password)
      navigate('/home', { replace: true })
    } catch (reason) {
      setError(messageFor(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute.">
      <form onSubmit={submit}>
        <IonInput
          fill="outline"
          label="Full name"
          labelPlacement="stacked"
          autocomplete="name"
          required
          value={name}
          onIonInput={(event) => setName(event.detail.value ?? '')}
        />
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
          autocomplete="new-password"
          required
          minlength={8}
          value={password}
          onIonInput={(event) => setPassword(event.detail.value ?? '')}
        />
        {error && (
          <IonNote color="danger" className="message">
            {error}
          </IonNote>
        )}
        <IonButton expand="block" type="submit" className="submit" disabled={busy}>
          Create account
        </IonButton>
        <IonButton fill="clear" expand="block" type="button" onClick={() => navigate('/login')}>
          Already have an account? Log in
        </IonButton>
      </form>
      <IonLoading isOpen={busy} message="Creating your account…" />
    </AuthLayout>
  )
}
