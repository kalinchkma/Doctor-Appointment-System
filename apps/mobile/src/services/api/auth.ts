import type { Session, User } from '../../types'
import { get, post } from './client'

export const register = (name: string, email: string, password: string) =>
  post<Session>('/api/auth/patient/register', { name, email, password })

export const login = (email: string, password: string) =>
  post<Session>('/api/auth/patient/login', { email, password })

/** Confirms a stored token is still valid when the app starts. */
export async function currentUser(): Promise<User | null> {
  const response = await get<{ user: User | null }>('/api/users/me')
  return response.user ?? null
}
