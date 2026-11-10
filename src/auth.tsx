// Anmeldung fuer die Verwaltung. Angemeldet ist, wer einen GitHub-Token hat, den GitHub
// annimmt. Was man damit darf, entscheidet GitHub ueber die Rechte am Daten-Repo; die
// Seite selbst schuetzt nichts, sie blendet die Verwaltung nur ein.
//
// Der Token liegt im Sitzungsspeicher des Browsers und verschwindet mit dem Tab. Nur wer
// "angemeldet bleiben" waehlt, legt ihn dauerhaft auf dem Geraet ab.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type Auth } from './authContext.ts'
import { createClient, GitHubError, projectKey, whoAmI } from './baukasten/githubClient.ts'

const TOKEN_KEY = projectKey('wv-github-token')

// Nur bei "npm run dev", aus der nicht eingecheckten .env.development.local, die Vite beim
// Bauen nicht liest. VITE_GITHUB_TOKEN darf beim Bauen nie gesetzt sein: githubClient.ts liest
// import.meta.env als Ganzes, damit stuende jede VITE_-Variable im Ergebnis.
const DEV_TOKEN: string = import.meta.env.DEV ? (import.meta.env.VITE_GITHUB_TOKEN ?? '') : ''

function readToken(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(TOKEN_KEY) || DEV_TOKEN
  } catch {
    return DEV_TOKEN
  }
}

// Der Token liegt immer nur an einer Stelle, auch nach einem Wechsel von dauerhaft zu Tab.
function writeToken(token: string, remember = false) {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(TOKEN_KEY)
    if (token) {
      const storage = remember ? window.localStorage : window.sessionStorage
      storage.setItem(TOKEN_KEY, token)
    }
  } catch {
    // Ohne Browser-Speicher muss man sich nach dem Neuladen neu anmelden.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readToken)
  const [login, setLogin] = useState('')
  const [checked, setChecked] = useState(false)

  // Nach dem Neuladen: den gespeicherten Token noch einmal von GitHub bestaetigen lassen.
  // Weg kommt er nur, wenn GitHub ihn ablehnt. Bei einem Netzwerkfehler oder einer Stoerung
  // bei GitHub bleibt er liegen und gilt beim naechsten Laden wieder.
  useEffect(() => {
    if (!token || login) {
      return
    }
    let active = true
    whoAmI(createClient(token)).then(
      (name) => active && setLogin(name),
      (reason: unknown) => {
        if (active && reason instanceof GitHubError && reason.status === 401) {
          writeToken('')
          setToken('')
        }
      },
    ).finally(() => active && setChecked(true))
    return () => {
      active = false
    }
  }, [token, login])

  const signIn = useCallback(async (next: string, remember: boolean) => {
    const name = await whoAmI(createClient(next))
    writeToken(next, remember)
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
