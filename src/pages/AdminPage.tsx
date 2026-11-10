import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useAuth } from '../authContext.ts'
import { createClient, DEFAULT_TARGET, readSetup } from '../baukasten/github.ts'
import { configFromText } from '../baukasten/generate.ts'
import { catalogue } from '../catalogueData.ts'
import { BaukastenPage } from './BaukastenPage.tsx'
import { EditorPage } from './EditorPage.tsx'
import { LoginForm } from './LoginForm.tsx'
import { SiteHeader } from './SiteHeader.tsx'

// Die Verwaltung, erreichbar nach dem Anmelden ueber ihren Reiter in der Kopfzeile.
// Was man dort darf, entscheidet GitHub ueber die Rechte am Daten-Repo.

const SETUP_TITLE = 'Werkverzeichnis Baukasten'

// Wer /admin direkt aufruft und nicht angemeldet ist, landet hier.
function LoginPage() {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: { sm: 'center' }, justifyContent: 'center', p: 2 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', maxWidth: 480 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Anmelden
        </Typography>
        <LoginForm />
      </Paper>
    </Box>
  )
}

// Liegt auf main eine baukasten.json, ist das Verzeichnis eingerichtet: dann die Bearbeitung
// der Daten, sonst die Einrichtung.
function ProjectAdmin({ onName }: { onName: (name: string) => void }) {
  const { token } = useAuth()
  const client = useMemo(() => createClient(token), [token])
  // undefined: wird noch geladen; null: noch nicht eingerichtet
  const [setup, setSetup] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const applySetup = useCallback(
    (text: string | null) => {
      setSetup(text)
      onName(text === null ? '' : configFromText(text).catalogue.label)
    },
    [onName],
  )

  useEffect(() => {
    let active = true
    readSetup(client, DEFAULT_TARGET).then(
      (text) => {
        if (active) {
          applySetup(text)
          setError('')
        }
      },
      (reason: Error) => active && setError(reason.message),
    )
    return () => {
      active = false
    }
  }, [client, attempt, applySetup])

  if (typeof setup === 'string') {
    return <EditorPage setup={setup} onName={onName} />
  }
  if (setup === null) {
    return <BaukastenPage onFinished={applySetup} />
  }
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, p: 2 }}>
      {error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setAttempt(attempt + 1)}>
              Erneut versuchen
            </Button>
          }
        >
          {DEFAULT_TARGET.owner}/{DEFAULT_TARGET.repo} ließ sich nicht lesen. {error}
        </Alert>
      ) : (
        <>
          <CircularProgress size={24} />
          <Typography color="text.secondary">Verzeichnis wird geladen …</Typography>
        </>
      )}
    </Box>
  )
}

export function AdminPage() {
  const { status } = useAuth()
  // null: noch unbekannt; leer: die Einrichtung laeuft noch
  const [name, setName] = useState<string | null>(null)
  // Bis der Name aus dem Repo da ist, gilt der der Website, damit die Reiter nicht springen.
  const title = status === 'signedIn' && name !== null ? name || SETUP_TITLE : catalogue.label
  return (
    <>
      <SiteHeader title={title} />
      {status === 'signedIn' ? (
        <ProjectAdmin onName={setName} />
      ) : status === 'checking' ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <CircularProgress size={24} />
          <Typography color="text.secondary">Anmeldung wird geprüft …</Typography>
        </Box>
      ) : (
        <LoginPage />
      )}
    </>
  )
}
