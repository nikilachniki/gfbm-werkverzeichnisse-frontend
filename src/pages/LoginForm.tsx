import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { useAuth } from '../authContext.ts'
import { DEFAULT_TARGET } from '../baukasten/githubClient.ts'
import { ExternalLink } from '../components/ExternalLink.tsx'

// Das Anmeldeformular der Redaktion, als Dialog von der Website aus und als Seite unter /admin.
export function LoginForm({ onSignedIn }: { onSignedIn?: () => void }) {
  const { signIn } = useAuth()
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    signIn(token.trim(), remember)
      .then(() => onSignedIn?.())
      .catch((reason: Error) => setError(reason.message.includes('401') ? 'GitHub kennt diesen Token nicht. Ist er abgelaufen oder falsch kopiert?' : reason.message))
      .finally(() => setBusy(false))
  }

  return (
    <Box component="form" onSubmit={submit}>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Die Verwaltung ist für die Redaktion. Angemeldet wird mit einem GitHub-Token, der Schreibrechte auf das Daten-Repo{' '}
        <ExternalLink href={`https://github.com/${DEFAULT_TARGET.owner}/${DEFAULT_TARGET.repo}`}>
          {DEFAULT_TARGET.owner}/{DEFAULT_TARGET.repo}
        </ExternalLink>{' '}
        hat.
      </Typography>
      <Stack spacing={2}>
        <TextField label="GitHub-Token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" autoFocus fullWidth />
        <FormControlLabel
          control={<Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />}
          label="Auf diesem Gerät angemeldet bleiben"
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={busy || !token.trim()}>
          {busy ? 'Wird geprüft …' : 'Anmelden'}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Noch keinen Token?{' '}
        <ExternalLink href="https://github.com/settings/personal-access-tokens/new">Fein granularen Token anlegen</ExternalLink>: nur für dieses Repo, mit
        Contents und Pull requests (lesen und schreiben) sowie Actions (lesen). Ohne den Haken bleibt er nur in diesem Browser-Tab gespeichert. Auf geteilten
        Rechnern den Haken bitte nicht setzen.
      </Typography>
    </Box>
  )
}

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        Anmelden
        <IconButton aria-label="Schließen" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <LoginForm onSignedIn={onClose} />
      </DialogContent>
    </Dialog>
  )
}
