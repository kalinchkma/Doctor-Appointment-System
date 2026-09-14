const baseURL = import.meta.env.VITE_PAYLOAD_URL || 'http://localhost:3000'

export type User = { id: string; name: string; email: string; role: 'admin' | 'patient' }
export type Doctor = { id: string; name: string; specialization: string; qualifications?: string; photoUrl?: string; bio?: string }
export type AppointmentSlot = { id: string; doctor: string | Doctor; date: string; time: string; status: 'available' | 'booked' }
type AuthResponse = { token: string; user: User }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, { headers: { 'Content-Type': 'application/json', ...init.headers }, ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.errors?.[0]?.message || body.message || 'Something went wrong. Please try again.')
  return body as T
}

export async function register(name: string, email: string, password: string) {
  return request<AuthResponse>('/api/auth/patient/register', { method: 'POST', body: JSON.stringify({ name, email, password }) })
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/patient/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export async function getDoctors() { return (await request<{ docs: Doctor[] }>('/api/doctors?where[active][equals]=true&sort=name')).docs }
export async function getSlots(doctorID: string) { return (await request<{ docs: AppointmentSlot[] }>(`/api/appointment-slots?where[doctor][equals]=${encodeURIComponent(doctorID)}&where[status][equals]=available&sort=date`)).docs }
