import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { ExternalLink } from '../components/ExternalLink.tsx'
import { entityUse, type Usage } from '../baukasten/generate.ts'
import { blockingEntity, ENTITIES, entityOf, isEntityActive, isFieldActive, type Config, type EntityDef, type EntityKey, type ExpressionMode, type FieldDef, type Origin, type Part } from '../baukasten/model.ts'

// Die Schalter fuer Bausteine und Felder. Mit usage (Bearbeitung eines eingerichteten
// Verzeichnisses) bleibt eingeschaltet, was schon Daten enthaelt.

function InUse({ count }: { count: number }) {
  return (
    <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5 }}>
      {count} {count === 1 ? 'Eintrag' : 'Einträge'} vorhanden, deshalb nicht abschaltbar
    </Typography>
  )
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

function EntityToggleCard({ entity, config, onToggle, usage }: { entity: EntityDef; config: Config; onToggle: (key: EntityKey, on: boolean) => void; usage?: Usage }) {
  const active = isEntityActive(config, entity.key)
  const used = usage && !entity.locked ? entityUse(usage, entity.key) : 0
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
            disabled={used > 0}
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
      {used > 0 && <InUse count={used} />}
    </Paper>
  )
}

export function BuildingBlocksStep({ config, onToggle, onMode, usage }: { config: Config; onToggle: (key: EntityKey, on: boolean) => void; onMode: (mode: ExpressionMode) => void; usage?: Usage }) {
  const chain = ENTITIES.filter((entity) => entity.chain)
  const helpers = ENTITIES.filter((entity) => !entity.chain)
  return (
    <Stack spacing={4}>
      {!usage && (
        <Alert severity="info" variant="outlined">
          Der Baukasten folgt{' '}
          <ExternalLink href="https://music-metadata-tools.github.io/MerMEId-Website/latest/">MerMEId MeLODy</ExternalLink>, einem
          Werkzeug für musikalische Metadaten, das auf dem{' '}
          <ExternalLink href="https://de.wikipedia.org/wiki/Functional_Requirements_for_Bibliographic_Records">FRBR-Datenmodell</ExternalLink>{' '}
          aufbaut. Wir verwenden dieselben Datentypen und Begriffe, deshalb lässt sich jedes Verzeichnis
          dorthin exportieren. Wo MeLODy etwas nicht vorsieht, etwa die Stücknummer in einem Druck, ergänzt die Vorlage eigene
          Felder. Sie sind im nächsten Schritt als „Erweiterung“ markiert und werden beim Export zu Text.
        </Alert>
      )}
      <Box component="section" aria-label="Werk, Fassung, Quelle und Exemplar">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'stretch' } }}>
          {chain.map((entity, index) => (
            <Stack key={entity.key} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'stretch' }}>
              {/* Karten gleich hoch, nur der Pfeil sitzt mittig. */}
              {index > 0 && <ArrowForwardIcon fontSize="small" color="action" sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }} aria-hidden />}
              <EntityToggleCard entity={entity} config={config} onToggle={onToggle} usage={usage} />
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
            <EntityToggleCard key={entity.key} entity={entity} config={config} onToggle={onToggle} usage={usage} />
          ))}
        </Box>
      </Box>
    </Stack>
  )
}

function FieldRow({ entity, field, config, onField, onEntity, usage }: { entity: EntityDef; field: FieldDef; config: Config; onField: (key: string, on: boolean) => void; onEntity: (key: EntityKey, on: boolean) => void; usage?: Usage }) {
  const fieldKey = `${entity.key}.${field.key}`
  const used = usage?.fields[fieldKey] ?? 0
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
              disabled={Boolean(blocker) || used > 0}
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
          {used > 0 && !field.required && <InUse count={used} />}
          {blocker && (
            <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => onEntity(blocker, true)}>
              Braucht {entityOf(blocker).plural}: einschalten
            </Button>
          )}
          {on && subfields.length > 0 && (
            <Box sx={{ mt: 1, display: 'grid', gap: 0.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              {subfields.map((part) => (
                <SubfieldToggle key={part.key} part={part} fieldKey={`${fieldKey}.${part.key}`} config={config} onField={onField} used={usage?.fields[`${fieldKey}.${part.key}`] ?? 0} />
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

function SubfieldToggle({ part, fieldKey, config, onField, used }: { part: Part; fieldKey: string; config: Config; onField: (key: string, on: boolean) => void; used: number }) {
  return (
    <FormControlLabel
      sx={{ alignItems: 'flex-start', m: 0 }}
      control={<Switch size="small" checked={Boolean(config.fields[fieldKey])} disabled={used > 0} onChange={(event) => onField(fieldKey, event.target.checked)} />}
      label={
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {part.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {part.help}
          </Typography>
          {used > 0 && <InUse count={used} />}
        </Box>
      }
    />
  )
}

export function FieldsStep({ config, onField, onEntity, usage }: { config: Config; onField: (key: string, on: boolean) => void; onEntity: (key: EntityKey, on: boolean) => void; usage?: Usage }) {
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
              <FieldRow key={field.key} entity={current} field={field} config={config} onField={onField} onEntity={onEntity} usage={usage} />
            ))}
          </Stack>
        </Box>
      </Box>
    </Stack>
  )
}
