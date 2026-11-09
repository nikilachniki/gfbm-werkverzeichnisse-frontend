import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAuth } from '../authContext.ts'
import { ExternalLink } from '../components/ExternalLink.tsx'
import { buildFiles, changedFiles, changedRecords, CONFIG_FILE, configForDraft, configFromText, configText, createMissingExpressions, draftFromFiles, runChecks, usageOf, type Draft } from '../baukasten/generate.ts'
import { createClient, DEFAULT_TARGET, mergePull, openRemote, projectKey, publish, pullStatus, saveRemote, type PullStatus, type RemoteState } from '../baukasten/github.ts'
import { withEntity, type Config } from '../baukasten/model.ts'
import { CheckList, DataWorkspace } from './DataWorkspace.tsx'
import { BuildingBlocksStep, FieldsStep } from './SetupControls.tsx'

// Die Bearbeitung eines fertig eingerichteten Verzeichnisses: immer die echten Daten aus dem Repo.

interface Project {
  config: Config
  draft: Draft
}

const STORAGE_KEY = projectKey('wv-editor')

function readStored(): Project | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Project) : null
  } catch {
    return null
  }
}

function writeStored(project: Project) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  } catch {
    // Ohne Speicher gehen beim Neuladen nur die noch nicht gespeicherten Aenderungen verloren.
  }
}

// Das Geoeffnete als Bearbeitungsstand. setup gilt, wenn ein aelterer Arbeitszweig die
// Einrichtung noch nicht enthaelt.
function projectFrom(files: Record<string, string>, stored: string | undefined, state: RemoteState, setup: string): Project {
  const text = stored ?? setup
  const draft = draftFromFiles(files, `${state.target.repo}/${state.target.path}`, state, text)
  const config = configForDraft(configFromText(text), draft)
  // Felder, die das Oeffnen wegen vorhandener Daten einschaltet, sind keine Aenderung.
  draft.source!.config = configText(config)
  return { config, draft }
}

// Noch nicht Gespeichertes aus dem Browser gilt nur, solange der Stand im Repo derselbe ist.
function withStored(fresh: Project): { project: Project; dropped: boolean } {
  const stored = readStored()
  const remote = stored?.draft.source?.remote
  if (!stored || !remote) {
    return { project: fresh, dropped: false }
  }
  const current = fresh.draft.source!.remote!
  if (remote.head === current.head && remote.branch === current.branch) {
    return { project: stored, dropped: false }
  }
  return { project: fresh, dropped: changedFiles(stored.config, stored.draft).length > 0 }
}

const CHECK_TEXT: Record<PullStatus['checks'], string> = {
  none: 'Keine Prüfung gestartet',
  pending: 'Prüfung läuft',
  success: 'Prüfung bestanden',
  failure: 'Prüfung fehlgeschlagen',
}

// GitHub legt den Lauf erst Sekunden nach dem Pull Request an, und er dauert eine Weile.
const POLL_MS = 5000
// Kommt so lange kein Lauf, gibt es vermutlich keinen, etwa ohne Workflow im Repo.
const START_TIMEOUT_MS = 60000

// Speichern in den Arbeitszweig, Veroeffentlichen als Pull Request, Zusammenfuehren.
function PublishPanel({ project, remote, onSaved, onReopen }: { project: Project; remote: RemoteState; onSaved: (draft: Draft) => void; onReopen: () => Promise<void> }) {
  const { token, login } = useAuth()
  const { config, draft } = project
  const changed = useMemo(() => changedFiles(config, draft), [config, draft])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadedPull, setPull] = useState<PullStatus | null>(null)
  // Der Stand, fuer den vergeblich auf eine Pruefung gewartet wurde
  const [noRunFor, setNoRunFor] = useState('')
  const [merged, setMerged] = useState(false)
  const client = useMemo(() => createClient(token), [token])
  // Ohne Arbeitszweig gibt es keinen offenen Pull Request. Ein Ergebnis zu einem aelteren
  // Stand sagt nichts ueber den jetzigen, etwa direkt nach erneutem Speichern.
  const pull = !remote.onBranch || !loadedPull ? null : loadedPull.head === remote.head ? loadedPull : { ...loadedPull, checks: 'none' as const, mergeable: null }
  // Bei einer Kollision startet GitHub keine Pruefung, darauf zu warten waere vergeblich.
  const waitingForStart = pull?.checks === 'none' && pull.mergeable !== false && noRunFor !== remote.head
  const unsettled = pull !== null && (waitingForStart || pull.checks === 'pending' || pull.mergeable === null)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const refresh = () => run(async () => setPull(await pullStatus(client, remote)))

  useEffect(() => {
    if (!remote.onBranch) {
      return undefined
    }
    let active = true
    pullStatus(client, remote).then(
      (next) => active && setPull(next),
      () => active && setPull(null),
    )
    return () => {
      active = false
    }
  }, [client, remote])

  useEffect(() => {
    if (!unsettled || busy) {
      return undefined
    }
    let active = true
    const timer = window.setTimeout(() => {
      pullStatus(client, remote).then(
        (next) => active && setPull(next),
        // Bei einem Aussetzer von GitHub bleibt der letzte Stand stehen, und es geht weiter.
        () => active && setPull((current) => current && { ...current }),
      )
    }, POLL_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [unsettled, busy, client, remote, loadedPull])

  useEffect(() => {
    if (!waitingForStart) {
      return undefined
    }
    const timer = window.setTimeout(() => setNoRunFor(remote.head), START_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [waitingForStart, remote.head])

  const save = () =>
    run(async () => {
      setMerged(false)
      const files: Record<string, string> = { ...buildFiles(config, draft), [CONFIG_FILE]: configText(config) }
      const text = message.trim() || `Bearbeitung: ${changed.join(', ')}`
      const state = await saveRemote(client, remote, Object.fromEntries(changed.map((file) => [file, files[file]])), text)
      // Das Gespeicherte ist der neue Ausgangspunkt.
      onSaved(draftFromFiles(files, draft.source!.name, state, files[CONFIG_FILE]))
      setMessage('')
    })

  const publishNow = () =>
    run(async () => {
      setPull(await publish(client, remote, `Werkverzeichnis: Änderungen von ${login}`, 'Aus der Verwaltung veröffentlicht. Die Prüfung läuft automatisch.'))
    })

  const merge = () =>
    run(async () => {
      if (!pull) {
        return
      }
      if (pull.checks !== 'success' && !window.confirm(`Der Pull Request hat den Stand „${CHECK_TEXT[pull.checks]}“. Trotzdem zusammenführen?`)) {
        return
      }
      await mergePull(client, remote, pull.number)
      setMerged(true)
      await onReopen()
      setPull(null)
    })

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Übernommene Einträge liegen zuerst nur in diesem Browser. „Nach GitHub speichern“ sichert sie in deinem Arbeitszweig <code>{remote.branch}</code>, öffentlich werden sie erst mit
        „Veröffentlichen“.
      </Typography>
      <TextField size="small" fullWidth label="Was wurde geändert?" placeholder={`Bearbeitung: ${changed.join(', ') || '…'}`} value={message} onChange={(event) => setMessage(event.target.value)} />
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant="contained" size="small" disabled={busy || changed.length === 0} onClick={save}>
          Nach GitHub speichern
        </Button>
        <Button variant="outlined" size="small" disabled={busy || !remote.onBranch || changed.length > 0 || pull !== null} onClick={publishNow}>
          Veröffentlichen
        </Button>
      </Stack>
      {pull && (
        <Alert severity={pull.checks === 'failure' ? 'error' : pull.checks === 'success' && pull.mergeable !== false ? 'success' : 'info'}>
          <ExternalLink href={pull.url}>Pull Request #{pull.number}</ExternalLink>: {waitingForStart ? 'Prüfung startet gleich' : CHECK_TEXT[pull.checks]}
          {pull.mergeable === false ? '. Kollidiert mit inzwischen Veröffentlichtem.' : '.'}
          {changed.length > 0 && ' Noch nicht Gespeichertes bitte zuerst speichern. Es kommt dann in diesen Pull Request und wird mitgeprüft.'}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Button color="inherit" size="small" disabled={busy} onClick={refresh}>
              Aktualisieren
            </Button>
            {/* Zusammenfuehren laedt das Verzeichnis neu, Ungespeichertes ginge dabei verloren. */}
            <Button color="inherit" size="small" disabled={busy || waitingForStart || pull.checks === 'pending' || pull.mergeable === false || changed.length > 0} onClick={merge}>
              Zusammenführen
            </Button>
          </Stack>
        </Alert>
      )}
      {merged && (
        <Alert severity="success" onClose={() => setMerged(false)}>
          Zusammengeführt. Die öffentliche Website wird jetzt neu gebaut. Bis die Änderungen dort sichtbar sind, können einige Minuten vergehen, danach hilft notfalls neu laden.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}

// Nachtraeglich aendern, was erfasst wird. Einschalten geht immer, abschalten nur, solange
// keine Daten betroffen sind. Gespeichert wird wie alles andere ueber den Pull Request.
function SetupPanel({ config, draft, onConfig }: { config: Config; draft: Draft; onConfig: (next: Config) => void }) {
  const usage = useMemo(() => usageOf(draft), [draft])
  const setCatalogue = (patch: Partial<Config['catalogue']>) => onConfig({ ...config, catalogue: { ...config.catalogue, ...patch } })
  const setEntity = (key: Parameters<typeof withEntity>[1], on: boolean) => onConfig(withEntity(config, key, on))
  return (
    <Stack spacing={4}>
      <Alert severity="info" variant="outlined">
        Einschalten geht jederzeit. Was schon Daten enthält, bleibt eingeschaltet, bis die Einträge gelöscht sind. Änderungen hier werden wie Daten nach GitHub gespeichert und veröffentlicht.
      </Alert>
      <Box component="section">
        <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
          Verzeichnis
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
          <TextField size="small" label="Name des Verzeichnisses" value={config.catalogue.label} onChange={(event) => setCatalogue({ label: event.target.value })} />
          <TextField size="small" label="Kürzel" helperText="Gilt nur für neue Werke, vorhandene Nummern bleiben." value={config.catalogue.abbreviation} onChange={(event) => setCatalogue({ abbreviation: event.target.value })} />
          <TextField
            size="small"
            multiline
            minRows={3}
            label="Info-Text"
            helperText="Erscheint auf der Website unter „Über dieses Projekt“."
            value={config.catalogue.description ?? ''}
            onChange={(event) => setCatalogue({ description: event.target.value })}
            sx={{ gridColumn: '1 / -1' }}
          />
        </Box>
      </Box>
      <Box component="section">
        <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
          Bausteine
        </Typography>
        <BuildingBlocksStep config={config} usage={usage} onToggle={setEntity} onMode={(expressionMode) => onConfig({ ...config, expressionMode })} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Die Verknüpfung von Werk und Fassung gilt nur für neue Werke.
        </Typography>
      </Box>
      <Box component="section">
        <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
          Felder
        </Typography>
        <FieldsStep config={config} usage={usage} onField={(key, on) => onConfig({ ...config, fields: { ...config.fields, [key]: on } })} onEntity={setEntity} />
      </Box>
    </Stack>
  )
}

type EditorTab = 'daten' | 'einrichtung' | 'export'

// Kopf der Spalte: der rote Zaehler nennt, wie viele Datensaetze noch nicht gespeichert sind.
function SaveHeader({ config, draft, remote }: { config: Config; draft: Draft; remote: RemoteState }) {
  const changes = useMemo(() => changedRecords(config, draft), [config, draft])
  const total = changes.reduce((sum, row) => sum + row.added + row.changed + row.removed, 0)
  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2">
          Änderungen speichern
        </Typography>
        {total > 0 && <Badge badgeContent={total} max={999} color="error" aria-label={`${total} noch nicht gespeichert`} sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }} />}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {remote.target.owner}/{remote.target.repo}. {total === 0 ? 'Alles gespeichert.' : 'Noch nicht gespeichert:'}
      </Typography>
      {total > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, typography: 'body2', color: 'text.secondary' }}>
          {changes.map((row) => (
            <li key={row.label}>
              {row.label}: {[row.added && `${row.added} neu`, row.changed && `${row.changed} geändert`, row.removed && `${row.removed} gelöscht`].filter(Boolean).join(', ')}
            </li>
          ))}
        </Box>
      )}
    </>
  )
}

// Nur was beim Speichern zaehlt. Es gilt das Uebernommene, ein offenes Formular noch nicht.
function SaveChecks({ config, draft, onFix }: { config: Config; draft: Draft; onFix: () => void }) {
  const errors = useMemo(() => runChecks(config, draft).filter((check) => check.level === 'error'), [config, draft])
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" component="h3">
        Prüfung
      </Typography>
      {errors.length === 0 && <Alert severity="success">Keine Fehler gefunden.</Alert>}
      <CheckList checks={errors} onFix={onFix} />
    </Stack>
  )
}

// Was beim Export nach MeLODy zu beachten ist. Das Speichern haengt nicht davon ab.
function ExportPanel({ config, draft }: { config: Config; draft: Draft }) {
  const hints = useMemo(() => runChecks(config, draft).filter((check) => check.level === 'info'), [config, draft])
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h3">
        Export nach MeLODy
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Der Export läuft bei jeder Prüfung auf GitHub mit. Diese Hinweise verhindern das Speichern nicht.
      </Typography>
      {hints.length === 0 && <Alert severity="success">Keine Hinweise zum Export.</Alert>}
      <CheckList checks={hints} onFix={() => undefined} showDetails />
    </Stack>
  )
}

export function EditorPage({ setup, onName }: { setup: string; onName: (name: string) => void }) {
  const { token, login } = useAuth()
  const client = useMemo(() => createClient(token), [token])
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState('')
  const [dropped, setDropped] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<EditorTab>('daten')

  const openProject = useCallback(async () => {
    const { files, config, state } = await openRemote(client, DEFAULT_TARGET, login)
    return projectFrom(files, config, state, setup)
  }, [client, login, setup])

  useEffect(() => {
    let active = true
    openProject().then(
      (fresh) => {
        if (active) {
          const restored = withStored(fresh)
          setProject(restored.project)
          setDropped(restored.dropped)
          setError('')
        }
      },
      (reason: Error) => active && setError(reason.message),
    )
    return () => {
      active = false
    }
  }, [openProject, attempt])

  useEffect(() => {
    if (project) {
      writeStored(project)
    }
  }, [project])

  // Der Kopf zeigt den Namen, der im Repo steht, nicht den gerade getippten.
  const savedName = project?.draft.source?.catalog.label as string | undefined
  useEffect(() => {
    if (savedName !== undefined) {
      onName(savedName)
    }
  }, [savedName, onName])

  if (!project) {
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
            Das Verzeichnis ließ sich nicht öffnen. {error}
          </Alert>
        ) : (
          <>
            <CircularProgress size={24} />
            <Typography color="text.secondary">Daten werden geladen …</Typography>
          </>
        )}
      </Box>
    )
  }

  const { config, draft } = project
  const remote = draft.source!.remote!
  const setDraft = (next: Draft) => setProject({ config, draft: next })

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '360px minmax(0, 1fr)' }, alignItems: 'flex-start' }}>
          <Paper variant="outlined" component="aside" sx={{ p: 2, minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 }, maxHeight: { lg: 'calc(100vh - 112px)' }, overflow: { lg: 'auto' } }}>
            <SaveHeader config={config} draft={draft} remote={remote} />
            {dropped && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                Das Verzeichnis hat sich inzwischen geändert. Nicht gespeicherte Änderungen aus diesem Browser wurden deshalb verworfen.
              </Alert>
            )}
            <Divider sx={{ my: 2 }} />
            <PublishPanel
              project={project}
              remote={remote}
              onSaved={setDraft}
              onReopen={async () => {
                setProject(await openProject())
              }}
            />
            <Divider sx={{ my: 2 }} />
            <SaveChecks config={config} draft={draft} onFix={() => setDraft(createMissingExpressions(draft))} />
          </Paper>
          <Box sx={{ minWidth: 0 }}>
            <Tabs value={tab} onChange={(_, value: EditorTab) => setTab(value)} aria-label="Bereiche der Verwaltung" sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tab value="daten" label="Daten" />
              <Tab value="einrichtung" label="Einrichtung" />
              <Tab value="export" label="Export" />
            </Tabs>
            {/* Beide bleiben geladen, damit ein offenes Formular den Wechsel uebersteht. */}
            <Box hidden={tab !== 'daten'}>
              <DataWorkspace config={config} draft={draft} onDraft={setDraft} showFiles={false} />
            </Box>
            <Box hidden={tab !== 'einrichtung'}>
              <SetupPanel config={config} draft={draft} onConfig={(next) => setProject({ draft, config: next })} />
            </Box>
            {/* Nur berechnen, wenn jemand hinschaut: Bei grossen Verzeichnissen kostet das Zeit. */}
            {tab === 'export' && <ExportPanel config={config} draft={draft} />}
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
