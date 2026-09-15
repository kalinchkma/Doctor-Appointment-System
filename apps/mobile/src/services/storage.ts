import { Preferences } from '@capacitor/preferences'

// Capacitor Preferences rather than localStorage: on Android the app runs from the
// https://localhost WebView origin, where web storage is not reliably persisted across
// launches. Preferences maps to SharedPreferences natively and to localStorage on the web.
const TOKEN_KEY = 'payload-token'

export async function readToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY })
  return value ?? null
}

export async function writeToken(token: string): Promise<void> {
  await Preferences.set({ key: TOKEN_KEY, value: token })
}

export async function clearToken(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY })
}
