import { createContext, useContext } from 'react'

// Anmeldung fuer die Verwaltung, bereitgestellt von AuthProvider (auth.tsx).
export interface Auth {
  // checking: ein gespeicherter Token wird gerade geprueft
  status: 'checking' | 'signedOut' | 'signedIn'
  token: string
  login: string
  signIn: (token: string) => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAuth braucht einen AuthProvider.')
  }
  return auth
}
