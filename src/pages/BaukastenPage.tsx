import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { strToU8, zipSync } from 'fflate'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepButton from '@mui/material/StepButton'
import Stepper from '@mui/material/Stepper'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { FieldEditor, type EditorContext } from '../baukasten/FieldEditor.tsx'
import { ExternalLink } from '../components/ExternalLink.tsx'
import { createClient, DEFAULT_TARGET, mergePull, openRemote, publish, pullStatus, saveRemote, type PullStatus } from '../baukasten/github.ts'
import { useAuth } from '../authContext.ts'
import {
  assignWorkIds,
  buildCollections,
  buildFiles,
  changedFiles,
  configForDraft,
  createMissingExpressions,
  DATA_FILES,
  displayName,
  draftFromFiles,
  emptyDraft,
  missingRequired,
  newExpression,
  newWork,
  recordFromName,
  runChecks,
  sampleDraft,
  splitPersonName,
  uniqueId,
  type Draft,
  type ExpressionDraft,
  type PlainEntity,
  type Values,
  type WorkDraft,
} from '../baukasten/generate.ts'
import {
  blockingEntity,
  changesFromPreset,
  configFromPreset,
  ENTITIES,
  entityOf,
  isEntityActive,
  isFieldActive,
  PRESETS,
  statsOf,
  type Config,
  type EntityDef,
  type EntityKey,
  type ExpressionMode,
  type FieldDef,
  type Origin,
  type Part,
  type PresetId,
} from '../baukasten/model.ts'

const STORAGE_KEY = 'wv-baukasten'
const STEPS = ['Vorlage', 'Bausteine', 'Felder', 'Ausprobieren']
const STEP_HEADINGS: { title?: string; intro?: string }[] = [
  { title: 'Womit soll dein Werkverzeichnis beginnen?', intro: 'Eine Vorlage ist nur ein Startpunkt. Jeden Baustein und jedes Feld kannst du danach ändern.' },
  { title: 'Welche Bausteine brauchst du?' },
  { title: 'Welche Felder sollen erfasst werden?' },
  // Beim Ausprobieren spricht die Seite fuer sich.
  {},
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

function OriginChip({ origin }: { origin: Origin }) {
  return origin === 'melody' ? (
    <Tooltip title="Begriff aus MeLODy, wird beim Export strukturiert übernommen.">
      <Chip size="small" label="MeLODy" variant="outlined" color="primary" />
    </Tooltip>
  ) : (
    <Tooltip title="Eigene Erweiterung im Namensraum wv:. Im JSON-LD vollwertig, beim MeLODy-Export wird daraus Text.">
      <Chip size="small" label="Erweiterung" variant="outlined" />
    </Tooltip>
  )
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
        </Box>
      </Paper>
    </Stack>
  )
}

const MODES: { id: ExpressionMode; name: string; tagline: string; description: string; effect: string }[] = [
  {
    id: 'auto',
    name: 'Automatisch',
    tagline: 'Jedes Werk bekommt eine Fassung',
    description: 'Zu jedem neuen Werk entsteht sofort eine Fassung, die Titel und Sprache übernimmt. Weitere Fassungen, etwa Bearbeitungen, lassen sich jederzeit ergänzen.',
    effect: 'Passt für die meisten Verzeichnisse.',
  },
  {
    id: 'manual',
    name: 'Von Hand',
    tagline: 'Volle Kontrolle',
    description: 'Fassungen entstehen nur, wenn du sie anlegst. Die Prüfung meldet Werke ohne Fassung und kann sie nachträglich ergänzen.',
    effect: 'Passt, wenn die Redaktion jede Gestalt bewusst bestimmen will.',
  },
]

function ModeDiagram({ mode }: { mode: ExpressionMode }) {
  const box = (label: string, dashed = false) => (
    <Box
      sx={{
        px: 1,
        py: 0.5,
        border: 1,
        borderRadius: 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? 'text.disabled' : 'primary.main',
        color: dashed ? 'text.secondary' : 'text.primary',
        typography: 'caption',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  )
  return (
    <Stack direction="row" spacing={0.75} aria-hidden sx={{ alignItems: 'center', minHeight: 64 }}>
      {box('Werk')}
      <ArrowForwardIcon fontSize="small" color="action" />
      {mode === 'auto' && (
        <Stack spacing={0.5}>
          {box('Fassung')}
          {box('+ Fassung', true)}
        </Stack>
      )}
      {mode === 'manual' && box('selbst anlegen', true)}
    </Stack>
  )
}

function EntityToggleCard({ entity, config, onToggle }: { entity: EntityDef; config: Config; onToggle: (key: EntityKey, on: boolean) => void }) {
  const active = isEntityActive(config, entity.key)
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0, opacity: active ? 1 : 0.65, borderColor: active && entity.chain ? 'primary.main' : 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 38 }}>
        <Typography variant="subtitle1" component="h4">
          {entity.chain ? entity.label : entity.plural}
          {entity.chain && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}({entity.type})
            </Typography>
          )}
        </Typography>
        {entity.locked ? (
          <Tooltip title={entity.locked}>
            <LockOutlinedIcon fontSize="small" color="action" aria-label="Pflichtbaustein" />
          </Tooltip>
        ) : (
          <Switch
            size="small"
            checked={config.entities[entity.key]}
            onChange={(event) => onToggle(entity.key, event.target.checked)}
            slotProps={{ input: { 'aria-label': `${entity.plural} verwenden` } }}
          />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {/* Immer die Beschreibung, damit die Kette beim Umschalten nicht ihre Hoehe aendert.
            Abhaengigkeiten schalten mit (setEntity), ein eigener Hinweis ist daher nicht noetig. */}
        {entity.blurb}
      </Typography>
    </Paper>
  )
}

function BuildingBlocksStep({ config, onToggle, onMode }: { config: Config; onToggle: (key: EntityKey, on: boolean) => void; onMode: (mode: ExpressionMode) => void }) {
  const chain = ENTITIES.filter((entity) => entity.chain)
  const helpers = ENTITIES.filter((entity) => !entity.chain)
  return (
    <Stack spacing={4}>
      <Alert severity="info" variant="outlined">
        Der Baukasten folgt{' '}
        <ExternalLink href="https://music-metadata-tools.github.io/MerMEId-Website/latest/">MerMEId MeLODy</ExternalLink>, einem
        Werkzeug für musikalische Metadaten, das auf dem{' '}
        <ExternalLink href="https://de.wikipedia.org/wiki/Functional_Requirements_for_Bibliographic_Records">FRBR-Datenmodell</ExternalLink>{' '}
        aufbaut. Wir verwenden dieselben Datentypen und Begriffe, deshalb lässt sich jedes Verzeichnis
        dorthin exportieren. Wo MeLODy etwas nicht vorsieht, etwa die Stücknummer in einem Druck, ergänzt die Vorlage eigene
        Felder. Sie sind im nächsten Schritt als „Erweiterung“ markiert und werden beim Export zu Text.
      </Alert>
      <Box component="section" aria-label="Werk, Fassung, Quelle und Exemplar">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'stretch' } }}>
          {chain.map((entity, index) => (
            <Stack key={entity.key} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'stretch' }}>
              {/* Karten gleich hoch, nur der Pfeil sitzt mittig. */}
              {index > 0 && <ArrowForwardIcon fontSize="small" color="action" sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }} aria-hidden />}
              <EntityToggleCard entity={entity} config={config} onToggle={onToggle} />
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box component="section">
        <Typography variant="subtitle1" component="h3" sx={{ mb: 1.5 }}>
          Wie hängen Werk und Fassung zusammen?
        </Typography>
        <Box role="radiogroup" aria-label="Verknüpfung von Werk und Fassung" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
          {MODES.map((mode) => {
            const selected = config.expressionMode === mode.id
            return (
              <Card key={mode.id} variant="outlined" sx={{ borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
                <CardActionArea role="radio" aria-checked={selected} onClick={() => onMode(mode.id)} sx={{ height: '100%', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
                  <ModeDiagram mode={mode.id} />
                  <Typography variant="subtitle1" component="h4">
                    {mode.name}
                  </Typography>
                  <Typography variant="caption" color="primary" sx={{ mb: 1 }}>
                    {mode.tagline}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {mode.description}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 'auto' }}>
                    {mode.effect}
                  </Typography>
                </CardActionArea>
              </Card>
            )
          })}
        </Box>
      </Box>

      <Box component="section">
        <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
          Hilfsdaten
        </Typography>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' } }}>
          {helpers.map((entity) => (
            <EntityToggleCard key={entity.key} entity={entity} config={config} onToggle={onToggle} />
          ))}
        </Box>
      </Box>
    </Stack>
  )
}

function FieldRow({ entity, field, config, onField, onEntity }: { entity: EntityDef; field: FieldDef; config: Config; onField: (key: string, on: boolean) => void; onEntity: (key: EntityKey, on: boolean) => void }) {
  const fieldKey = `${entity.key}.${field.key}`
  const blocker = blockingEntity(config, field)
  const on = isFieldActive(config, entity.key, field)
  const subfields = field.input.kind === 'rows' ? field.input.parts.filter((part) => part.toggle) : []
  return (
    <Box sx={{ py: 1.25 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ width: 38, flexShrink: 0, display: 'flex', justifyContent: 'center', pt: 0.25 }}>
          {field.required ? (
            <Tooltip title={field.derived ?? 'Pflichtfeld'}>
              <LockOutlinedIcon fontSize="small" color="action" aria-label="Pflichtfeld" />
            </Tooltip>
          ) : (
            <Switch
              size="small"
              checked={Boolean(config.fields[fieldKey]) && !blocker}
              disabled={Boolean(blocker)}
              onChange={(event) => onField(fieldKey, event.target.checked)}
              slotProps={{ input: { 'aria-label': field.label } }}
            />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body1" sx={{ fontWeight: 500, color: on ? 'text.primary' : 'text.secondary' }}>
              {field.label}
            </Typography>
            <OriginChip origin={field.origin} />
            {field.derived && <Chip size="small" label="automatisch" />}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            <HelpText field={field} />
          </Typography>
          {blocker && (
            <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => onEntity(blocker, true)}>
              Braucht {entityOf(blocker).plural}: einschalten
            </Button>
          )}
          {on && subfields.length > 0 && (
            <Box sx={{ mt: 1, display: 'grid', gap: 0.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              {subfields.map((part) => (
                <SubfieldToggle key={part.key} part={part} fieldKey={`${fieldKey}.${part.key}`} config={config} onField={onField} />
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

function HelpText({ field }: { field: FieldDef }) {
  const at = field.link ? field.help.indexOf(field.link.text) : -1
  if (!field.link || at < 0) {
    return field.help
  }
  return (
    <>
      {field.help.slice(0, at)}
      <ExternalLink href={field.link.href}>{field.link.text}</ExternalLink>
      {field.help.slice(at + field.link.text.length)}
    </>
  )
}

function SubfieldToggle({ part, fieldKey, config, onField }: { part: Part; fieldKey: string; config: Config; onField: (key: string, on: boolean) => void }) {
  return (
    <FormControlLabel
      sx={{ alignItems: 'flex-start', m: 0 }}
      control={<Switch size="small" checked={Boolean(config.fields[fieldKey])} onChange={(event) => onField(fieldKey, event.target.checked)} />}
      label={
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {part.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {part.help}
          </Typography>
        </Box>
      }
    />
  )
}

function FieldsStep({ config, onField, onEntity }: { config: Config; onField: (key: string, on: boolean) => void; onEntity: (key: EntityKey, on: boolean) => void }) {
  const entities = ENTITIES.filter((entity) => isEntityActive(config, entity.key))
  const [selected, setSelected] = useState<EntityKey>('works')
  const current = entities.find((entity) => entity.key === selected) ?? entities[0]
  const activeCount = (entity: EntityDef) => entity.fields.filter((field) => isFieldActive(config, entity.key, field)).length
  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, alignItems: 'flex-start' }}>
        <Tabs
          orientation="vertical"
          value={current.key}
          onChange={(_, value: EntityKey) => setSelected(value)}
          variant="scrollable"
          aria-label="Datentypen"
          // Bleibt beim Scrollen durch lange Feldlisten stehen. top entspricht dem oberen
          // Innenabstand des Inhalts (py: 3), sonst rueckt die Liste beim Scrollen ein Stueck nach.
          sx={{ flexShrink: 0, width: { xs: '100%', md: 200 }, display: { xs: 'none', md: 'flex' }, borderRight: 1, borderColor: 'divider', position: 'sticky', top: (theme) => theme.spacing(3) }}
        >
          {entities.map((entity) => (
            <Tab key={entity.key} value={entity.key} sx={{ alignItems: 'flex-start' }} label={`${entity.plural} (${activeCount(entity)}/${entity.fields.length})`} />
          ))}
        </Tabs>
        <Tabs
          value={current.key}
          onChange={(_, value: EntityKey) => setSelected(value)}
          variant="scrollable"
          aria-label="Datentypen"
          sx={{ width: '100%', display: { xs: 'flex', md: 'none' } }}
        >
          {entities.map((entity) => (
            <Tab key={entity.key} value={entity.key} label={`${entity.plural} (${activeCount(entity)})`} />
          ))}
        </Tabs>
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <Stack divider={<Divider />}>
            {current.fields.map((field) => (
              <FieldRow key={field.key} entity={current} field={field} config={config} onField={onField} onEntity={onEntity} />
            ))}
          </Stack>
        </Box>
      </Box>
    </Stack>
  )
}

type Editing =
  | { entity: 'works'; work: WorkDraft; isNew: boolean }
  | { entity: PlainEntity; record: Values; isNew: boolean }

// Der Entwurf samt dem Datensatz, der gerade bearbeitet wird. Daraus entsteht die Live-Vorschau.
function withEditing(draft: Draft, editing: Editing | null): Draft {
  if (!editing) {
    return draft
  }
  if (editing.entity === 'works') {
    const assigned = assignWorkIds(editing.work, draft.works)
    return {
      ...draft,
      works: editing.isNew ? [...draft.works, assigned] : draft.works.map((work) => (work.id === assigned.id ? assigned : work)),
    }
  }
  const list = draft.records[editing.entity]
  const id = recordId(editing.entity, editing.record, list)
  const record = { ...editing.record, '@id': id }
  return {
    ...draft,
    records: {
      ...draft.records,
      [editing.entity]: editing.isNew ? [...list, record] : list.map((other) => (other['@id'] === id ? record : other)),
    },
  }
}

function recordId(entity: PlainEntity, record: Values, list: Values[]): string {
  if (record['@id']) {
    return record['@id'] as string
  }
  const identifiers = record.identifiers as { value?: string }[] | undefined
  const base = identifiers?.find((identifier) => identifier.value?.trim())?.value || displayName(entity, record) || 'neu'
  return uniqueId(entity, base, list.map((other) => other['@id'] as string))
}

function FieldStack({ entity, values, config, onChange, context, omit = [] }: { entity: EntityDef; values: Values; config: Config; onChange: (next: Values) => void; context: EditorContext; omit?: string[] }) {
  const fields = entity.fields.filter((field) => isFieldActive(config, entity.key, field) && field.input.kind !== 'auto' && !omit.includes(field.key))
  return (
    <Stack spacing={2}>
      {fields.map((field) => {
        const compound = field.input.kind === 'rows' || field.input.kind === 'titles' || (field.input.kind === 'object' && field.input.parts.length > 1)
        return (
          <Box key={field.key}>
            {compound && (
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                {field.label}
              </Typography>
            )}
            <FieldEditor
              part={field}
              entity={entity.key}
              field={field}
              value={values[field.key]}
              onChange={(next) => onChange({ ...values, [field.key]: next })}
              context={context}
            />
          </Box>
        )
      })}
    </Stack>
  )
}

function WorkForm({ work, config, onChange, context }: { work: WorkDraft; config: Config; onChange: (next: WorkDraft) => void; context: EditorContext }) {
  const mode = config.expressionMode
  const expressionEntity = entityOf('expressions')
  const updateExpression = (index: number, patch: Partial<ExpressionDraft>) =>
    onChange({ ...work, expressions: work.expressions.map((expression, position) => (position === index ? { ...expression, ...patch } : expression)) })
  const noun = 'Fassung'

  return (
    <Stack spacing={3}>
      <FieldStack entity={entityOf('works')} values={work.values} config={config} onChange={(values) => onChange({ ...work, values })} context={context} />

      {work.expressions.map((expression, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" component="h4">
              {`${noun} ${index + 1}`}
            </Typography>
            {(mode === 'manual' || index > 0) && (
              <IconButton size="small" aria-label={`${noun} ${index + 1} entfernen`} onClick={() => onChange({ ...work, expressions: work.expressions.filter((_, position) => position !== index) })}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Bezeichnung"
              placeholder={index === 0 ? 'Folgt dem Werktitel' : 'Etwa „Fassung für Viola“'}
              helperText={index === 0 ? 'Leer lassen, dann folgt sie dem Werktitel.' : undefined}
              value={expression.label}
              onChange={(event) => updateExpression(index, { label: event.target.value })}
            />
            <FieldStack entity={expressionEntity} values={expression.values} config={config} onChange={(values) => updateExpression(index, { values })} context={context} />
          </Stack>
        </Paper>
      ))}

      {work.expressions.length === 0 && (
        <Alert severity="warning">Dieses Werk hat noch keine Fassung. Keine Quelle kann darauf verweisen.</Alert>
      )}
      <Button startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...work, expressions: [...work.expressions, newExpression()] })}>
        {`${noun} ergänzen`}
      </Button>
    </Stack>
  )
}

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
        {title}
      </Typography>
      <Box
        component="pre"
        tabIndex={0}
        sx={{ m: 0, mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, overflow: 'auto', fontSize: 12, lineHeight: 1.5, fontFamily: 'monospace' }}
      >
        {children}
      </Box>
    </Box>
  )
}

function ResultPanel({ config, draft, editing, onFix, onDownload }: { config: Config; draft: Draft; editing: Editing | null; onFix: () => void; onDownload: () => void }) {
  const preview = useMemo(() => withEditing(draft, editing), [draft, editing])
  const { collections } = useMemo(() => buildCollections(config, preview), [config, preview])
  // Fuer die Pruefung zaehlt das Gespeicherte und das gerade Bearbeitete.
  const checks = useMemo(() => runChecks(config, preview), [config, preview])
  const errors = checks.filter((check) => check.level === 'error')
  const [tab, setTab] = useState<string>('aktuell')

  const activeFiles = ENTITIES.filter((entity) => isEntityActive(config, entity.key))
  const current = useMemo(() => {
    if (!editing) {
      return []
    }
    if (editing.entity === 'works') {
      const assigned = assignWorkIds(editing.work, draft.works)
      return [
        { title: 'works.json', records: collections.works.filter((record) => record['@id'] === assigned.id) },
        { title: 'expressions.json', records: collections.expressions.filter((record) => assigned.expressions.some((expression) => expression.id === record['@id'])) },
      ]
    }
    const id = recordId(editing.entity, editing.record, draft.records[editing.entity])
    return [{ title: entityOf(editing.entity).file, records: collections[editing.entity].filter((record) => record['@id'] === id) }]
  }, [editing, draft, collections])

  const selectedEntity = tab === 'aktuell' ? null : (ENTITIES.find((entity) => entity.key === tab) ?? null)

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" component="h3">
            Prüfung
          </Typography>
          <Button variant="contained" size="small" startIcon={<DownloadIcon />} disabled={errors.length > 0} onClick={onDownload}>
            Verzeichnis herunterladen
          </Button>
        </Stack>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {errors.length === 0 && <Alert severity="success">Gültig und FRBR-konform. Jede Datei folgt dem Schema der Vorlage.</Alert>}
          {checks.map((check) => (
            <Alert
              key={check.text}
              severity={check.level === 'error' ? 'error' : 'info'}
              action={
                check.fix ? (
                  <Button color="inherit" size="small" onClick={onFix}>
                    Anlegen
                  </Button>
                ) : undefined
              }
            >
              {check.text}
            </Alert>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" component="h3">
          Was in den Dateien entsteht
        </Typography>
        <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 1.5 }} aria-label="Dateien">
          <Tab value="aktuell" label="Aktuell" sx={{ minWidth: 0 }} />
          {activeFiles.map((entity) => (
            <Tab key={entity.key} value={entity.key} label={`${entity.plural} (${collections[entity.key].length})`} sx={{ minWidth: 0 }} />
          ))}
        </Tabs>
        {selectedEntity ? (
          <CodeBlock title={selectedEntity.file}>{JSON.stringify(collections[selectedEntity.key], null, 2)}</CodeBlock>
        ) : current.length > 0 ? (
          <Stack spacing={1.5}>
            {current.map(({ title, records }) => (
              <CodeBlock key={title} title={title}>
                {JSON.stringify(records.length === 1 ? records[0] : records, null, 2)}
              </CodeBlock>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Lege links einen Datensatz an oder öffne einen. Hier siehst du dann live, welche Einträge daraus entstehen.
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}

// Die Daten dieser Seite, erst beim Oeffnen geladen. sync-data.mjs legt sie nach src/data.
const SITE_DATA = import.meta.glob<string>('../data/*.json', { query: '?raw', import: 'default' })

async function loadSiteData(): Promise<Draft> {
  const files: Record<string, string> = {}
  for (const [path, load] of Object.entries(SITE_DATA)) {
    files[path.slice(path.lastIndexOf('/') + 1)] = await load()
  }
  return draftFromFiles(files, 'Daten dieser Seite')
}

// Aus einem gewaehlten Ordner den data/-Ordner nehmen: entweder den Ordner selbst oder,
// wenn ein ganzes Repo gewaehlt wurde, dessen Unterordner data.
async function loadFolder(list: FileList): Promise<Draft> {
  const byFolder = new Map<string, Map<string, File>>()
  for (const file of Array.from(list)) {
    const relative = file.webkitRelativePath || file.name
    const folder = relative.slice(0, relative.lastIndexOf('/'))
    if (!byFolder.has(folder)) {
      byFolder.set(folder, new Map())
    }
    byFolder.get(folder)!.set(file.name, file)
  }
  const complete = [...byFolder.entries()].filter(([, files]) => DATA_FILES.every((name) => files.has(name)))
  if (complete.length === 0) {
    throw new Error(`Kein Ordner mit allen Dateien gefunden (${DATA_FILES.join(', ')}).`)
  }
  // Bevorzugt der Ordner "data", dann der kuerzeste Pfad.
  complete.sort(([a], [b]) => Number(b.endsWith('data')) - Number(a.endsWith('data')) || a.length - b.length)
  const [folder, files] = complete[0]
  const texts: Record<string, string> = {}
  for (const name of DATA_FILES) {
    texts[name] = await files.get(name)!.text()
  }
  return draftFromFiles(texts, folder || 'Ordner')
}

const CHECK_TEXT: Record<PullStatus['checks'], string> = {
  none: 'keine Prüfung eingerichtet',
  pending: 'Prüfung läuft',
  success: 'Prüfung bestanden',
  failure: 'Prüfung fehlgeschlagen',
}

// Anmelden, Speichern in den Arbeitszweig, Veroeffentlichen als Pull Request, Zusammenfuehren.
function RemotePanel({ config, draft, onDraft }: { config: Config; draft: Draft; onDraft: (next: Draft) => void }) {
  const { token, login } = useAuth()
  const remote = draft.source?.remote
  const changed = useMemo(() => changedFiles(config, draft), [config, draft])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadedPull, setPull] = useState<PullStatus | null>(null)
  const client = useMemo(() => createClient(token), [token])
  // Ohne Arbeitszweig gibt es keinen offenen Pull Request.
  const pull = remote?.onBranch ? loadedPull : null

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

  const refresh = () => run(async () => setPull(remote ? await pullStatus(client, remote) : null))

  useEffect(() => {
    if (remote?.onBranch) {
      pullStatus(client, remote).then(setPull, () => setPull(null))
    }
  }, [client, remote])

  if (!remote) {
    return (
      <Typography variant="body2" color="text.secondary">
        Öffne das Verzeichnis aus dem Repo, um dorthin zu speichern.
      </Typography>
    )
  }

  const save = () =>
    run(async () => {
      const files = buildFiles(config, draft)
      const text = message.trim() || `Baukasten: ${changed.join(', ')}`
      const state = await saveRemote(client, remote, Object.fromEntries(changed.map((file) => [file, files[file]])), text)
      // Das Gespeicherte ist der neue Ausgangspunkt.
      onDraft(draftFromFiles(files, draft.source!.name, state))
      setMessage('')
    })

  const publishNow = () =>
    run(async () => {
      setPull(await publish(client, remote, `Werkverzeichnis: Änderungen von ${login}`, 'Aus dem Baukasten veröffentlicht. Die Prüfung läuft automatisch.'))
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
      const reopened = await openRemote(client, remote.target, login)
      onDraft(draftFromFiles(reopened.files, draft.source!.name, reopened.state))
      setPull(null)
    })

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Gespeichert wird in deinen Arbeitszweig <code>{remote.branch}</code>
        {remote.onBranch ? '' : ' (entsteht beim ersten Speichern)'}, veröffentlicht über einen Pull Request nach <code>{remote.target.base}</code>.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
        <TextField size="small" label="Was wurde geändert?" placeholder={`Baukasten: ${changed.join(', ') || '…'}`} value={message} onChange={(event) => setMessage(event.target.value)} sx={{ flex: 1, minWidth: 220 }} />
        <Button variant="contained" size="small" disabled={busy || changed.length === 0} onClick={save}>
          Speichern
        </Button>
        <Button variant="outlined" size="small" disabled={busy || !remote.onBranch || changed.length > 0 || pull !== null} onClick={publishNow}>
          Veröffentlichen
        </Button>
      </Stack>
      {changed.length > 0 && remote.onBranch && (
        <Typography variant="caption" color="text.secondary">
          Erst speichern, dann veröffentlichen.
        </Typography>
      )}
      {pull && (
        <Alert
          severity={pull.checks === 'failure' ? 'error' : pull.checks === 'success' && pull.mergeable !== false ? 'success' : 'info'}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" disabled={busy} onClick={refresh}>
                Aktualisieren
              </Button>
              <Button color="inherit" size="small" disabled={busy || pull.checks === 'pending' || pull.mergeable === false} onClick={merge}>
                Zusammenführen
              </Button>
            </Stack>
          }
        >
          <ExternalLink href={pull.url}>Pull Request #{pull.number}</ExternalLink>: {CHECK_TEXT[pull.checks]}
          {pull.mergeable === false ? '. Kollidiert mit inzwischen Veröffentlichtem.' : '.'}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}

function SourceBar({ config, draft, onOpen, onClose, onDraft }: { config: Config; draft: Draft; onOpen: (next: Draft) => void; onClose: () => void; onDraft: (next: Draft) => void }) {
  const [error, setError] = useState('')
  const { token, login, status } = useAuth()
  const signedIn = status === 'signedIn'
  const changed = useMemo(() => changedFiles(config, draft), [config, draft])

  const open = (load: () => Promise<Draft>) => {
    const hasEntries = draft.works.length > 0 || Object.values(draft.records).some((records) => records.length > 0)
    if (hasEntries && !window.confirm('Die bisherigen Einträge unter „Ausprobieren“ werden ersetzt. Öffnen?')) {
      return
    }
    setError('')
    load().then(onOpen, (reason: Error) => setError(reason.message))
  }
  const openFromRepo = async () => {
    const { files, state } = await openRemote(createClient(token), DEFAULT_TARGET, login)
    return draftFromFiles(files, `${DEFAULT_TARGET.repo}/${DEFAULT_TARGET.path} (${state.onBranch ? state.branch : DEFAULT_TARGET.base})`, state)
  }
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h3">
            {draft.source ? `Geöffnet: ${draft.source.name}` : 'Vorhandenes Verzeichnis öffnen'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {draft.source
              ? changed.length > 0
                ? `Geändert: ${changed.join(', ')}. Alles andere bleibt Byte für Byte, wie es war.`
                : 'Noch nichts geändert. Beim Herunterladen entstehen genau die geöffneten Dateien.'
              : 'Bearbeite echte Daten statt eines Entwurfs. Was der Baukasten nicht kennt, bleibt unangetastet.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap' }} useFlexGap>
          {signedIn && (
            <Button size="small" variant="contained" onClick={() => open(openFromRepo)}>
              Aus dem Repo öffnen
            </Button>
          )}
          <Button size="small" variant="outlined" onClick={() => open(loadSiteData)}>
            Daten dieser Seite
          </Button>
          <Button size="small" variant="outlined" component="label">
            Ordner wählen …
            <input
              hidden
              type="file"
              multiple
              {...{ webkitdirectory: '' }}
              onChange={(event) => {
                const files = event.target.files
                event.target.value = ''
                if (files && files.length > 0) {
                  open(() => loadFolder(files))
                }
              }}
            />
          </Button>
          {draft.source && (
            <Button size="small" onClick={onClose}>
              Schließen
            </Button>
          )}
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {signedIn && (
        <>
          <Divider sx={{ my: 2 }} />
          <RemotePanel config={config} draft={draft} onDraft={onDraft} />
        </>
      )}
    </Paper>
  )
}

function TryOutStep({ config, draft, onDraft, onOpen, onDownload, sampleAvailable }: { config: Config; draft: Draft; onDraft: (next: Draft) => void; onOpen: (next: Draft) => void; onDownload: () => void; sampleAvailable: boolean }) {
  const entities = ENTITIES.filter((entity) => entity.key !== 'expressions' && isEntityActive(config, entity.key))
  const [selected, setSelected] = useState<EntityKey>('works')
  const [editing, setEditing] = useState<Editing | null>(null)
  const current = entities.find((entity) => entity.key === selected) ?? entities[0]

  const list: { id: string; label: string }[] =
    current.key === 'works'
      ? draft.works.map((work) => ({ id: work.id, label: displayName('works', work.values) || work.id }))
      : draft.records[current.key as PlainEntity].map((record) => ({ id: record['@id'] as string, label: displayName(current.key, record) || (record['@id'] as string) }))

  const startNew = () => {
    if (current.key === 'works') {
      setEditing({ entity: 'works', work: newWork(config), isNew: true })
    } else {
      setEditing({ entity: current.key as PlainEntity, record: {}, isNew: true })
    }
  }

  const open = (id: string) => {
    if (current.key === 'works') {
      const work = draft.works.find((other) => other.id === id)
      if (work) {
        setEditing({ entity: 'works', work: structuredClone(work), isNew: false })
      }
    } else {
      const record = draft.records[current.key as PlainEntity].find((other) => other['@id'] === id)
      if (record) {
        setEditing({ entity: current.key as PlainEntity, record: structuredClone(record), isNew: false })
      }
    }
  }

  const missing = !editing
    ? []
    : editing.entity === 'works'
      ? missingRequired(config, entityOf('works'), editing.work.values)
      : missingRequired(config, entityOf(editing.entity), editing.record)

  const save = () => {
    onDraft(withEditing(draft, editing))
    setEditing(null)
  }

  const remove = () => {
    if (!editing) {
      return
    }
    if (editing.entity === 'works') {
      onDraft({ ...draft, works: draft.works.filter((work) => work.id !== editing.work.id) })
    } else {
      const entity = editing.entity
      onDraft({ ...draft, records: { ...draft.records, [entity]: draft.records[entity].filter((record) => record['@id'] !== editing.record['@id']) } })
    }
    setEditing(null)
  }

  const context: EditorContext = {
    config,
    // Neue Hilfsdatensaetze stehen sofort zur Wahl, auch ohne dass das Formular gespeichert ist.
    draft,
    createRecord: (entity, name) => {
      const list = draft.records[entity]
      const record = recordFromName(entity, name)
      const id = uniqueId(entity, entity === 'persons' ? (record.familyName as string) : name, list.map((other) => other['@id'] as string))
      onDraft({ ...draft, records: { ...draft.records, [entity]: [...list, { ...record, '@id': id }] } })
      return id
    },
  }

  const isEmpty = draft.works.length === 0 && Object.values(draft.records).every((records) => records.length === 0)

  return (
    <Stack spacing={3}>
      <SourceBar
        config={config}
        draft={draft}
        onDraft={onDraft}
        onOpen={(next) => {
          setEditing(null)
          onOpen(next)
        }}
        onClose={() => {
          if (changedFiles(config, draft).length === 0 || window.confirm('Ungespeicherte Änderungen gehen verloren. Schließen?')) {
            setEditing(null)
            onDraft(emptyDraft())
          }
        }}
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'flex-start' }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Tabs
            value={current.key}
            onChange={(_, value: EntityKey) => {
              setSelected(value)
              setEditing(null)
            }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Datentypen"
          >
            {entities.map((entity) => (
              <Tab key={entity.key} value={entity.key} sx={{ minWidth: 0 }} label={entity.plural} />
            ))}
          </Tabs>

          {editing ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
                {editing.isNew ? `${current.label} anlegen` : `${current.label} bearbeiten`}
              </Typography>
              {editing.entity === 'works' ? (
                <WorkForm work={editing.work} config={config} context={context} onChange={(work) => setEditing({ ...editing, work })} />
              ) : (
                <FieldStack entity={current} values={editing.record} config={config} context={context} onChange={(record) => setEditing({ ...editing, record })} />
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 3, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                <Button variant="contained" disabled={missing.length > 0} onClick={save}>
                  Speichern
                </Button>
                <Button onClick={() => setEditing(null)}>Abbrechen</Button>
                {!editing.isNew && (
                  <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={remove}>
                    Löschen
                  </Button>
                )}
                {missing.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Es fehlt noch: {missing.join(', ')}
                  </Typography>
                )}
              </Stack>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" component="h3">
                  {current.plural} ({list.length})
                </Typography>
                <Stack direction="row" spacing={1}>
                  {sampleAvailable && isEmpty && !draft.source && (
                    <Button size="small" onClick={() => onDraft(sampleDraft(config))}>
                      Beispiel laden
                    </Button>
                  )}
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={startNew}>
                    {current.label} anlegen
                  </Button>
                </Stack>
              </Stack>
              {list.length > 0 ? (
                <List dense disablePadding sx={{ mt: 1 }}>
                  {list.map((entry) => (
                    <ListItemButton key={entry.id} onClick={() => open(entry.id)} sx={{ borderRadius: 1 }}>
                      <ListItemText primary={entry.label} secondary={entry.id} />
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {current.key === 'works' ? 'Noch keine Werke. Lege eines an und beobachte, was rechts passiert.' : `Noch nichts angelegt. ${current.blurb}`}
                </Typography>
              )}
            </Paper>
          )}
        </Stack>
        <Box sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
          <ResultPanel config={config} draft={draft} editing={editing} onFix={() => onDraft(createMissingExpressions(draft))} onDownload={onDownload} />
        </Box>
      </Box>
    </Stack>
  )
}

function download(config: Config, draft: Draft) {
  const files = buildFiles(config, draft)
  const entries: Record<string, Uint8Array> = {}
  for (const [name, content] of Object.entries(files)) {
    entries[`data/${name}`] = strToU8(content)
  }
  // Die Auswahl reist mit, damit sich das Verzeichnis spaeter weiterbauen laesst.
  entries['baukasten.json'] = strToU8(`${JSON.stringify(config, null, 2)}\n`)
  const zipped = zipSync(entries)
  const url = URL.createObjectURL(new Blob([zipped as BlobPart], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'werkverzeichnis.zip'
  link.click()
  URL.revokeObjectURL(url)
}

export function BaukastenPage() {
  const [stored] = useState(loadStored)
  const [config, setConfig] = useState<Config>(() => stored?.config ?? configFromPreset('lasso'))
  const [draft, setDraft] = useState<Draft>(() => stored?.draft ?? emptyDraft())
  const [step, setStep] = useState(0)

  useEffect(() => saveStored({ config, draft }), [config, draft])

  const stats = statsOf(config)
  const changes = changesFromPreset(config)

  const setField = (key: string, on: boolean) => setConfig((previous) => ({ ...previous, fields: { ...previous.fields, [key]: on } }))
  // Abhaengige Bausteine folgen: Ohne Quelle kein Exemplar, ein Exemplar braucht seine Quelle.
  const setEntity = (key: EntityKey, on: boolean) =>
    setConfig((previous) => {
      const entities = { ...previous.entities, [key]: on }
      const follow = (changed: EntityKey) => {
        for (const entity of ENTITIES) {
          if (!on && entity.requires === changed && entities[entity.key]) {
            entities[entity.key] = false
            follow(entity.key)
          }
        }
        const required = entityOf(changed).requires
        if (on && required && !entities[required]) {
          entities[required] = true
          follow(required)
        }
      }
      follow(key)
      return { ...previous, entities }
    })

  const selectPreset = (id: PresetId) => {
    setConfig(configFromPreset(id))
    // Ein Entwurf passt nur zufaellig zu einer anderen Vorlage.
    setDraft(emptyDraft())
  }

  const hasDraft = draft.works.length > 0 || Object.values(draft.records).some((records) => records.length > 0)

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
        <TryOutStep
          config={config}
          draft={draft}
          onDraft={setDraft}
          onOpen={(next) => {
            setDraft(next)
            // Damit alles Vorhandene im Formular erscheint.
            setConfig((previous) => configForDraft(previous, next))
          }}
          onDownload={() => download(config, draft)}
          sampleAvailable={config.presetId !== 'blank'}
        />
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
              <Button variant="contained" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
                Weiter
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Paper>
    </Box>
  )
}
