// Anmeldung fuer die Verwaltung. Angemeldet ist, wer einen GitHub-Token hat, den GitHub
// annimmt. Was man damit darf, entscheidet GitHub ueber die Rechte am Daten-Repo; die
// Seite selbst schuetzt nichts, sie blendet die Verwaltung nur ein.
//
// Der Token liegt nur im Sitzungsspeicher des Browsers und verschwindet mit dem Tab.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type Auth } from './authContext.ts'
import { createClient, projectKey, whoAmI } from './baukasten/github.ts'

const TOKEN_KEY = projectKey('wv-github-token')

function readToken(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeToken(token: string) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token)
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Ohne Sitzungsspeicher muss man sich nach dem Neuladen neu anmelden.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readToken)
  const [login, setLogin] = useState('')
  const [checked, setChecked] = useState(false)

  // Nach dem Neuladen: den Token aus der Sitzung noch einmal von GitHub bestaetigen lassen.
  useEffect(() => {
    if (!token || login) {
      return
    }
    let active = true
    whoAmI(createClient(token)).then(
      (name) => active && setLogin(name),
      () => {
        if (active) {
          writeToken('')
          setToken('')
        }
      },
    ).finally(() => active && setChecked(true))
    return () => {
      active = false
    }
  }, [token, login])

  const signIn = useCallback(async (next: string) => {
    const name = await whoAmI(createClient(next))
    writeToken(next)
    setToken(next)
    setLogin(name)
  }, [])

  const signOut = useCallback(() => {
    writeToken('')
    setToken('')
    setLogin('')
    setChecked(false)
  }, [])

  const status: Auth['status'] = token && login ? 'signedIn' : token && !checked ? 'checking' : 'signedOut'
  const value = useMemo(() => ({ status, token, login, signIn, signOut }), [status, token, login, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
