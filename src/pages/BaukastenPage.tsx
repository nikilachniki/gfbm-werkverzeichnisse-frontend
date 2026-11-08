import { useEffect, useState, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Container from '@mui/material/Container'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepButton from '@mui/material/StepButton'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DataWorkspace } from './DataWorkspace.tsx'
import { BuildingBlocksStep, FieldsStep } from './SetupControls.tsx'
import { createClient, DEFAULT_TARGET, finishSetup, projectKey } from '../baukasten/github.ts'
import { useAuth } from '../authContext.ts'
import { emptyDraft, sampleDraft, splitPersonName, type Draft } from '../baukasten/generate.ts'
import {
  withEntity,
  changesFromPreset,
  configFromPreset,
  PRESETS,
  statsOf,
  type Config,
  type EntityKey,
  type PresetId,
} from '../baukasten/model.ts'

// Alle Projekte liegen unter derselben Browser-Adresse, deshalb je Projekt ein eigener Eintrag.
const STORAGE_KEY = projectKey('wv-baukasten')
const STEPS = ['Vorlage', 'Bausteine', 'Felder', 'Ausprobieren']
const STEP_HEADINGS: { title?: string; intro?: string; warning?: string }[] = [
  { title: 'Womit soll dein Werkverzeichnis beginnen?', intro: 'Eine Vorlage ist nur ein Startpunkt. Jeden Baustein und jedes Feld kannst du danach ändern.' },
  { title: 'Welche Bausteine brauchst du?' },
  { title: 'Welche Felder sollen erfasst werden?' },
  { title: 'Formulare ausprobieren', warning: 'Änderungen werden nicht gespeichert!' },
]

interface Stored {
  config: Config
  draft: Draft
}

// Nur Bequemlichkeit: Ohne Speicher im Browser beginnt der Baukasten einfach neu.
function loadStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const stored = JSON.parse(raw) as Stored
    // Frueher drei Modi: gekoppelt und "erste Fassung automatisch" sind jetzt einer.
    const mode = stored.config.expressionMode as string
    if (mode === 'coupled' || mode === 'first') {
      stored.config.expressionMode = 'auto'
    }
    return stored
  } catch {
    return null
  }
}

function saveStored(stored: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Ohne Speicher geht beim Neuladen nur der Entwurf verloren.
  }
}

function clearStored() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Dann bleibt nur ein alter Entwurf liegen, den niemand mehr oeffnet.
  }
}

// Ohne Komma wird der Name geraten. Die Anzeige zeigt, was dabei herauskommt.
function composerHint(name: string): string {
  if (!name.trim() || name.includes(',')) {
    return 'Nachname, Vorname'
  }
  const { familyName, givenName } = splitPersonName(name)
  return `Gelesen als Nachname „${familyName}“${givenName ? `, Vorname „${givenName}“` : ''}`
}

function PresetStep({ config, onSelect, onCatalogue }: { config: Config; onSelect: (id: PresetId) => void; onCatalogue: (patch: Partial<Config['catalogue']>) => void }) {
  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {PRESETS.map((preset) => {
          const selected = config.presetId === preset.id
          const stats = statsOf({ ...preset.config, presetId: preset.id })
          return (
            <Card key={preset.id} variant="outlined" sx={{ borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
              <CardActionArea onClick={() => onSelect(preset.id)} aria-pressed={selected} sx={{ height: '100%', p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
                <Typography variant="h6" component="h3">
                  {preset.name}
                </Typography>
                <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                  {preset.example ? `(Beispiel: ${preset.example})` : ' '}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {preset.description}
                </Typography>
                <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0, mb: 2 }}>
                  {preset.highlights.map((highlight) => (
                    <Typography key={highlight} component="li" variant="body2">
                      {highlight}
                    </Typography>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto' }}>
                  {stats.types} Datentypen, {stats.fields} Felder
                </Typography>
              </CardActionArea>
            </Card>
          )
        })}
      </Box>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" component="h3" sx={{ mb: 2 }}>
          Dein Verzeichnis
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' } }}>
          <TextField size="small" label="Name" value={config.catalogue.label} onChange={(event) => onCatalogue({ label: event.target.value })} />
          <TextField
            size="small"
            label="Komponist*in"
            helperText={composerHint(config.catalogue.composer)}
            value={config.catalogue.composer}
            onChange={(event) => onCatalogue({ composer: event.target.value })}
          />
          <TextField
            size="small"
            label="Kürzel"
            helperText="Etwa LV oder BWV. Neue Werke werden danach nummeriert."
            value={config.catalogue.abbreviation}
            onChange={(event) => onCatalogue({ abbreviation: event.target.value })}
          />
          <TextField
            size="small"
            multiline
            minRows={3}
            label="Info-Text"
            helperText="Erscheint auf der Website unter „Über dieses Projekt“. Lässt sich später in der Verwaltung ändern."
            value={config.catalogue.description ?? ''}
            onChange={(event) => onCatalogue({ description: event.target.value })}
            sx={{ gridColumn: '1 / -1' }}
          />
        </Box>
      </Paper>
    </Stack>
  )
}

// Die Einrichtung eines neuen Verzeichnisses. Sie endet mit "Abschliessen"; danach zeigt
// die Verwaltung die Bearbeitung der echten Daten (EditorPage).
export function BaukastenPage({ onFinished }: { onFinished: (setup: string) => void }) {
  const { token, login } = useAuth()
  const [stored] = useState(loadStored)
  const [config, setConfig] = useState<Config>(() => stored?.config ?? configFromPreset('lasso'))
  const [draft, setDraft] = useState<Draft>(() => stored?.draft ?? emptyDraft())
  const [step, setStep] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState('')

  useEffect(() => saveStored({ config, draft }), [config, draft])

  const stats = statsOf(config)
  const changes = changesFromPreset(config)

  const setField = (key: string, on: boolean) => setConfig((previous) => ({ ...previous, fields: { ...previous.fields, [key]: on } }))
  const setEntity = (key: EntityKey, on: boolean) => setConfig((previous) => withEntity(previous, key, on))

  const selectPreset = (id: PresetId) => {
    setConfig(configFromPreset(id))
    // Ein Entwurf passt nur zufaellig zu einer anderen Vorlage.
    setDraft(emptyDraft())
  }

  const hasDraft = draft.works.length > 0 || Object.values(draft.records).some((records) => records.length > 0)
  const nameMissing = !config.catalogue.label.trim()

  const finish = async () => {
    setFinishing(true)
    setFinishError('')
    try {
      const setup = await finishSetup(createClient(token), DEFAULT_TARGET, login, config)
      clearStored()
      onFinished(setup)
    } catch (reason) {
      setFinishError((reason as Error).message)
      setFinishing(false)
    }
  }

  let body: ReactNode
  switch (step) {
    case 0:
      body = (
        <PresetStep
          config={config}
          onSelect={(id) => {
            if (id !== config.presetId && (!hasDraft || window.confirm('Beim Wechsel der Vorlage gehen die Einträge unter „Ausprobieren“ verloren. Wechseln?'))) {
              selectPreset(id)
            }
          }}
          onCatalogue={(patch) => setConfig((previous) => ({ ...previous, catalogue: { ...previous.catalogue, ...patch } }))}
        />
      )
      break
    case 1:
      body = (
        <BuildingBlocksStep
          config={config}
          onToggle={setEntity}
          onMode={(expressionMode) => setConfig((previous) => ({ ...previous, expressionMode }))}
        />
      )
      break
    case 2:
      body = <FieldsStep config={config} onField={setField} onEntity={setEntity} />
      break
    default:
      body = (
        <DataWorkspace config={config} draft={draft} onDraft={setDraft} showFiles onSample={config.presetId === 'blank' ? undefined : () => setDraft(sampleDraft(config))} />
      )
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Schritte und Ueberschrift bleiben stehen, nur der Inhalt darunter scrollt. */}
      <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="xl" sx={{ pt: { xs: 2, sm: 3 }, pb: 2 }}>
          <Stepper nonLinear activeStep={step} sx={{ mb: STEP_HEADINGS[step].title ? { xs: 2, sm: 3 } : 0, maxWidth: 760 }}>
            {STEPS.map((label, index) => (
              <Step key={label} completed={false}>
                <StepButton
                  color="inherit"
                  onClick={() => setStep(index)}
                  // Auf schmalen Bildschirmen nur die Beschriftung des aktuellen Schritts, sonst passt die Leiste nicht.
                  sx={{ '& .MuiStepLabel-labelContainer': { display: { xs: index === step ? 'block' : 'none', sm: 'block' } } }}
                >
                  {label}
                </StepButton>
              </Step>
            ))}
          </Stepper>
          {STEP_HEADINGS[step].title && (
            <Typography variant="h4" component="h2" sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' } }}>
              {STEP_HEADINGS[step].title}
            </Typography>
          )}
          {STEP_HEADINGS[step].intro && (
            // Auf dem Handy nimmt der feste Kopf sonst zu viel Hoehe weg.
            <Typography color="text.secondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
              {STEP_HEADINGS[step].intro}
            </Typography>
          )}
          {STEP_HEADINGS[step].warning && (
            <Alert severity="warning" variant="filled" sx={{ mt: 1, width: 'fit-content', fontWeight: 600 }}>
              {STEP_HEADINGS[step].warning}
            </Alert>
          )}
        </Container>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {body}
        </Container>
      </Box>
      <Paper square elevation={0} sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
        <Container maxWidth="xl" sx={{ pt: 2, pb: 'calc(20px + env(safe-area-inset-bottom))' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
              {stats.types} Datentypen, {stats.fields} Felder
              {changes > 0 && (
                <>
                  {' · '}
                  {changes} {changes === 1 ? 'Änderung' : 'Änderungen'} gegenüber der Vorlage{' '}
                  <Button
                    size="small"
                    sx={{ minWidth: 0, py: 0, verticalAlign: 'baseline' }}
                    onClick={() => setConfig((previous) => ({ ...configFromPreset(previous.presetId), catalogue: previous.catalogue }))}
                  >
                    Zurücksetzen
                  </Button>
                </>
              )}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
                Zurück
              </Button>
              {step === STEPS.length - 1 ? (
                <Button variant="contained" onClick={() => setConfirming(true)}>
                  Abschließen
                </Button>
              ) : (
                <Button variant="contained" onClick={() => setStep(step + 1)}>
                  Weiter
                </Button>
              )}
            </Stack>
          </Stack>
        </Container>
      </Paper>
      <Dialog open={confirming} onClose={() => !finishing && setConfirming(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Einrichtung abschließen?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              <strong>{config.catalogue.label.trim() || 'Noch ohne Name'}</strong>
              {config.catalogue.abbreviation.trim() && ` (${config.catalogue.abbreviation.trim()})`}
              {config.catalogue.composer.trim() && `, ${config.catalogue.composer.trim()}`}
              <br />
              {stats.types} Datentypen, {stats.fields} Felder
            </Typography>
            <Typography color="text.secondary">
              Die Einrichtung wird in <code>{DEFAULT_TARGET.owner}/{DEFAULT_TARGET.repo}</code> gespeichert. Danach öffnet sich hier die Bearbeitung der echten Daten.
            </Typography>
            {hasDraft && <Alert severity="warning">Die Einträge vom Ausprobieren werden nicht übernommen.</Alert>}
            {nameMissing && <Alert severity="error">Trage im Schritt „Vorlage“ zuerst den Namen des Verzeichnisses ein.</Alert>}
            {finishError && <Alert severity="error">{finishError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={finishing} onClick={() => setConfirming(false)}>
            Zurück
          </Button>
          <Button variant="contained" disabled={finishing || nameMissing} onClick={finish}>
            {finishing ? 'Wird gespeichert …' : 'Abschließen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
