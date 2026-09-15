import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '../types'
import * as authApi from '../services/api/auth'
import { setUnauthenticatedHandler } from '../services/api/client'
import { clearToken, readToken, writeToken } from '../services/storage'

type AuthState = {
  user: User | null
  /** True until the stored token has been checked, so routes do not flash the login page. */
  restoring: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [restoring, setRestoring] = useState(true)

  const logout = useCallback(async () => {
    await clearToken()
    setUser(null)
  }, [])

  // A 401 from any request means the stored token is no longer usable.
  useEffect(() => {
    setUnauthenticatedHandler(() => setUser(null))
    return () => setUnauthenticatedHandler(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      try {
        if (await readToken()) {
          const existing = await authApi.currentUser()
          if (!cancelled) setUser(existing)
        }
      } catch {
        // An expired or rejected token simply means the user starts signed out.
        await clearToken()
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const accept = useCallback(async (session: Session) => {
    await writeToken(session.token)
    setUser(session.user)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      restoring,
      login: async (email, password) => accept(await authApi.login(email, password)),
      register: async (name, email, password) =>
        accept(await authApi.register(name, email, password)),
      logout,
    }),
    [user, restoring, accept, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
