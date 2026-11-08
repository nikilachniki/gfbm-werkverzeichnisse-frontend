import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import LogoutIcon from '@mui/icons-material/Logout'
import { AuthProvider } from '../auth.tsx'
import { useAuth } from '../authContext.ts'
import { createClient, DEFAULT_TARGET, readSetup } from '../baukasten/github.ts'
import { catalogue } from '../catalogueData.ts'
import { ExternalLink } from '../components/ExternalLink.tsx'
import { BaukastenPage } from './BaukastenPage.tsx'
import { EditorPage } from './EditorPage.tsx'

// Die Verwaltung: eigene Ansicht mit eigenem Kopf, erreichbar nur nach dem Anmelden.
// Was man dort darf, entscheidet GitHub ueber die Rechte am Daten-Repo.

function AdminHeader() {
  const { status, login, signOut } = useAuth()
  return (
    <AppBar sx={{ flexShrink: 0 }}>
      <Toolbar sx={{ gap: 2, py: 1 }}>
        <Box component="img" src={`${import.meta.env.BASE_URL}gfbm-lion.png`} alt="" sx={{ height: { xs: 36, sm: 44 }, width: 'auto', flexShrink: 0 }} />
        <Divider orientation="vertical" flexItem sx={{ borderColor: 'currentColor', opacity: 0.2 }} />
        <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
          <Typography variant="overline" component="p" sx={{ lineHeight: 1.2, opacity: 0.7, display: 'block' }}>
            Verwaltung
          </Typography>
          <Typography variant="h6" component="h1" noWrap title={catalogue.label} sx={{ lineHeight: 1.2 }}>
            {catalogue.label}
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {status === 'signedIn' && <Chip label={login} size="small" variant="outlined" sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
        {/* Auf schmalen Bildschirmen nur die Symbole, damit der Name Platz behaelt. */}
        <Button component={RouterLink} to="/" color="inherit" size="small" startIcon={<ArrowBackIcon />} sx={{ flexShrink: 0, display: { xs: 'none', md: 'inline-flex' } }}>
          Zur Website
        </Button>
        <Tooltip title="Zur Website">
          <IconButton component={RouterLink} to="/" color="inherit" aria-label="Zur Website" sx={{ display: { md: 'none' } }}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        {status === 'signedIn' && (
          <>
            <Button color="inherit" size="small" startIcon={<LogoutIcon />} onClick={signOut} sx={{ flexShrink: 0, display: { xs: 'none', md: 'inline-flex' } }}>
              Abmelden
            </Button>
            <Tooltip title="Abmelden">
              <IconButton color="inherit" aria-label="Abmelden" onClick={signOut} sx={{ display: { md: 'none' } }}>
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Toolbar>
    </AppBar>
  )
}

function LoginPage() {
  const { signIn } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    signIn(token.trim())
      .catch((reason: Error) => setError(reason.message.includes('401') ? 'GitHub kennt diesen Token nicht. Ist er abgelaufen oder falsch kopiert?' : reason.message))
      .finally(() => setBusy(false))
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: { sm: 'center' }, justifyContent: 'center', p: 2 }}>
      <Paper variant="outlined" component="form" onSubmit={submit} sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', maxWidth: 480 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Anmelden
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Die Verwaltung ist für die Redaktion. Angemeldet wird mit einem GitHub-Token, der Schreibrechte auf das Daten-Repo{' '}
          <ExternalLink href={`https://github.com/${DEFAULT_TARGET.owner}/${DEFAULT_TARGET.repo}`}>
            {DEFAULT_TARGET.owner}/{DEFAULT_TARGET.repo}
          </ExternalLink>{' '}
          hat.
        </Typography>
        <Stack spacing={2}>
          <TextField label="GitHub-Token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" autoFocus fullWidth />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={busy || !token.trim()}>
            {busy ? 'Wird geprüft …' : 'Anmelden'}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Noch keinen Token?{' '}
          <ExternalLink href="https://github.com/settings/personal-access-tokens/new">Fein granularen Token anlegen</ExternalLink>: nur für dieses Repo, mit
          Contents und Pull requests (lesen und schreiben) sowie Actions (lesen). Er bleibt nur in diesem Browser-Tab gespeichert.
        </Typography>
      </Paper>
    </Box>
  )
}

// Die Anmeldung gibt es nur hier; die oeffentliche Seite laedt sie nicht.
export function AdminPage() {
  return (
    <AuthProvider>
      <AdminArea />
    </AuthProvider>
  )
}

// Liegt auf main eine baukasten.json, ist das Verzeichnis eingerichtet: dann die Bearbeitung
// der Daten, sonst die Einrichtung.
function ProjectAdmin() {
  const { token } = useAuth()
  const client = useMemo(() => createClient(token), [token])
  // undefined: wird noch geladen; null: noch nicht eingerichtet
  const [setup, setSetup] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    readSetup(client, DEFAULT_TARGET).then(
      (text) => {
        if (active) {
          setSetup(text)
          setError('')
        }
      },
      (reason: Error) => active && setError(reason.message),
    )
    return () => {
      active = false
    }
  }, [client, attempt])

  if (typeof setup === 'string') {
    return <EditorPage setup={setup} />
  }
  if (setup === null) {
    return <BaukastenPage onFinished={setSetup} />
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

function AdminArea() {
  const { status } = useAuth()
  return (
    <>
      <AdminHeader />
      {status === 'signedIn' ? (
        <ProjectAdmin />
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
