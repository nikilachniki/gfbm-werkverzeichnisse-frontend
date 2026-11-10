import { createContext, useContext } from 'react'

// Anmeldung fuer die Verwaltung, bereitgestellt von AuthProvider (auth.tsx).
export interface Auth {
  // checking: ein gespeicherter Token wird gerade geprueft
  status: 'checking' | 'signedOut' | 'signedIn'
  token: string
  login: string
  // remember: den Token dauerhaft auf dem Geraet behalten statt nur im Tab
  signIn: (token: string, remember: boolean) => Promise<void>
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
