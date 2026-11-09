import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import { displayName, type Draft, type PlainEntity, type Values } from './generate.ts'
import {
  isPartUsable,
  isSubfieldActive,
  type Config,
  type EntityKey,
  type Input,
  type Option,
  type Part,
} from './model.ts'

export interface EditorContext {
  config: Config
  draft: Draft
  // Legt zu einem eingetippten Namen einen Datensatz an und liefert seine ID.
  createRecord: (entity: PlainEntity, name: string) => string
}

const TITLE_LANGUAGES: Option[] = [
  { value: '@none', label: 'ohne' },
  { value: 'la', label: 'la' },
  { value: 'it', label: 'it' },
  { value: 'fr', label: 'fr' },
  { value: 'de', label: 'de' },
  { value: 'en', label: 'en' },
]

interface RefOption {
  id: string
  label: string
  // Gesetzt bei "Neu anlegen".
  create?: string
}

const filter = createFilterOptions<RefOption>()

function recordOptions(draft: Draft, entity: EntityKey): RefOption[] {
  if (entity === 'works') {
    return draft.works.map((work) => ({ id: work.id, label: displayName('works', work.values) || work.id }))
  }
  if (entity === 'expressions') {
    return []
  }
  return draft.records[entity].map((record) => ({
    id: record['@id'] as string,
    label: displayName(entity, record) || (record['@id'] as string),
  }))
}

function RefPicker({ input, label, value, onChange, context }: { input: Extract<Input, { kind: 'ref' }>; label: string; value: string | undefined; onChange: (next: string | undefined) => void; context: EditorContext }) {
  const options = recordOptions(context.draft, input.to)
  const selected = value ? (options.find((option) => option.id === value) ?? { id: value, label: value }) : null
  return (
    <Autocomplete<RefOption, false, false, false>
      size="small"
      fullWidth
      options={options}
      value={selected}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      getOptionLabel={(option) => option.label}
      noOptionsText={input.create ? 'Namen tippen, um anzulegen' : 'Noch nichts angelegt'}
      filterOptions={(all, state) => {
        const filtered = filter(all, state)
        const typed = state.inputValue.trim()
        if (input.create && typed && !all.some((option) => option.label === typed)) {
          filtered.push({ id: '', label: `„${typed}“ neu anlegen`, create: typed })
        }
        return filtered
      }}
      onChange={(_, option) => {
        if (option?.create) {
          onChange(context.createRecord(input.to as PlainEntity, option.create))
        } else {
          onChange(option?.id || undefined)
        }
      }}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  )
}

function RefsPicker({ input, label, value, onChange, context }: { input: Extract<Input, { kind: 'refs' }>; label: string; value: string[]; onChange: (next: string[]) => void; context: EditorContext }) {
  const options = recordOptions(context.draft, input.to)
  const selected = value.map((id) => options.find((option) => option.id === id) ?? { id, label: id })
  return (
    <Autocomplete<RefOption, true, false, false>
      multiple
      size="small"
      fullWidth
      options={options}
      value={selected}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      getOptionLabel={(option) => option.label}
      filterOptions={(all, state) => {
        const filtered = filter(all, state)
        const typed = state.inputValue.trim()
        if (input.create && typed && !all.some((option) => option.label === typed)) {
          filtered.push({ id: '', label: `„${typed}“ neu anlegen`, create: typed })
        }
        return filtered
      }}
      onChange={(_, next) => {
        onChange(next.map((option) => (option.create ? context.createRecord(input.to as PlainEntity, option.create) : option.id)))
      }}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  )
}

// Man waehlt ein Werk. Der Verweis geht auf dessen Expression, denn so verlangt es FRBR.
// Hat ein Werk mehrere, steht jede einzeln zur Wahl; ohne Expression ist es gesperrt.
function PiecePicker({ label, value, onChange, context }: { label: string; value: string | undefined; onChange: (next: string | undefined) => void; context: EditorContext }) {
  const options: (RefOption & { disabled?: boolean })[] = context.draft.works.flatMap((work) => {
    const title = displayName('works', work.values) || work.id
    if (work.expressions.length === 0) {
      return [{ id: `leer:${work.id}`, label: `${title} (noch keine Fassung)`, disabled: true }]
    }
    return work.expressions.map((expression, index) => ({
      id: expression.id,
      label: index === 0 && work.expressions.length === 1 ? title : `${title}: ${expression.label || `Fassung ${index + 1}`}`,
    }))
  })
  const selected = value ? (options.find((option) => option.id === value) ?? { id: value, label: value }) : null
  return (
    <Autocomplete
      size="small"
      fullWidth
      options={options}
      value={selected}
      getOptionDisabled={(option) => Boolean((option as { disabled?: boolean }).disabled)}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      getOptionLabel={(option) => option.label}
      noOptionsText="Noch kein Werk gespeichert"
      onChange={(_, option) => onChange(option?.id)}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  )
}

function TitleRow({ value, label, onChange, onRemove }: { value: Record<string, string>; label: string; onChange: (next: Record<string, string>) => void; onRemove?: () => void }) {
  const [language = '@none', text = ''] = Object.entries(value)[0] ?? []
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField
        select
        size="small"
        label="Sprache"
        value={language}
        onChange={(event) => onChange({ [event.target.value]: text })}
        sx={{ width: 96, flexShrink: 0 }}
      >
        {TITLE_LANGUAGES.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" fullWidth label={label} value={text} onChange={(event) => onChange({ [language]: event.target.value })} />
      {onRemove && (
        <IconButton size="small" aria-label={`${label} entfernen`} onClick={onRemove}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  )
}

function usableParts(parts: Part[], context: EditorContext, entity: EntityKey, field: Part): Part[] {
  return parts.filter((part) => isPartUsable(context.config, part) && isSubfieldActive(context.config, entity, field, part))
}

export function FieldEditor({ part, entity, field, value, onChange, context }: { part: Part; entity: EntityKey; field: Part; value: unknown; onChange: (next: unknown) => void; context: EditorContext }) {
  const { input, label } = part
  switch (input.kind) {
    case 'text':
      if (input.suggest) {
        return (
          <Autocomplete<string, false, true, true>
            freeSolo
            disableClearable
            size="small"
            fullWidth
            options={input.suggest}
            value={(value as string) ?? ''}
            onChange={(_, next) => onChange(next)}
            onInputChange={(_, next, reason) => {
              if (reason === 'input') {
                onChange(next)
              }
            }}
            renderInput={(params) => <TextField {...params} label={label} placeholder={input.placeholder} />}
          />
        )
      }
      return (
        <TextField
          size="small"
          fullWidth
          multiline={input.multiline}
          minRows={input.multiline ? 2 : undefined}
          label={label}
          placeholder={input.placeholder}
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'number':
      return (
        <TextField
          size="small"
          fullWidth
          type="number"
          label={label}
          value={(value as number | string) ?? ''}
          slotProps={{ htmlInput: { min: 1 } }}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'date':
      return (
        <TextField
          size="small"
          fullWidth
          type="date"
          label={label}
          value={(value as string) ?? ''}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'link':
      return <TextField size="small" fullWidth type="url" label={label} placeholder="https://…" value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)} />
    case 'select':
      return (
        <TextField select size="small" fullWidth label={label} value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)}>
          <MenuItem value="">
            <em>keine Angabe</em>
          </MenuItem>
          {input.options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )
    case 'strings':
    case 'links':
      return (
        <Autocomplete
          multiple
          freeSolo
          autoSelect
          size="small"
          options={[]}
          value={(value as string[]) ?? []}
          onChange={(_, next) => onChange(next)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              placeholder={input.kind === 'links' ? 'https://… und Eingabetaste' : (input.placeholder ?? 'Text und Eingabetaste')}
            />
          )}
        />
      )
    case 'terms': {
      const selected = input.options.filter((option) => ((value as string[]) ?? []).includes(option.value))
      return (
        <Autocomplete
          multiple
          size="small"
          options={input.options}
          value={selected}
          isOptionEqualToValue={(option, other) => option.value === other.value}
          getOptionLabel={(option) => option.label}
          onChange={(_, next) => onChange(next.map((option) => option.value))}
          renderInput={(params) => <TextField {...params} label={label} />}
        />
      )
    }
    case 'ref':
      return <RefPicker input={input} label={label} value={value as string | undefined} onChange={onChange} context={context} />
    case 'refs':
      return <RefsPicker input={input} label={label} value={(value as string[]) ?? []} onChange={onChange} context={context} />
    case 'piece':
      return <PiecePicker label={label} value={value as string | undefined} onChange={onChange} context={context} />
    case 'langText':
      return <TitleRow label={label} value={(value as Record<string, string>) ?? {}} onChange={onChange} />
    case 'titles': {
      const rows = (value as { text: Record<string, string> }[] | undefined) ?? [{ text: {} }]
      const canAdd = input.max === undefined || rows.length < input.max
      return (
        <Stack spacing={1}>
          {rows.map((row, index) => (
            <TitleRow
              key={index}
              label={input.typed ? (index === 0 ? 'Haupttitel' : 'Titelvariante') : label}
              value={row.text ?? {}}
              onChange={(text) => onChange(rows.map((other, position) => (position === index ? { text } : other)))}
              onRemove={index > 0 ? () => onChange(rows.filter((_, position) => position !== index)) : undefined}
            />
          ))}
          {canAdd && (
            <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, { text: { [Object.keys(rows[0]?.text ?? {})[0] ?? '@none']: '' } }])}>
              {input.typed ? 'Titelvariante ergänzen' : 'Titel ergänzen'}
            </Button>
          )}
        </Stack>
      )
    }
    case 'object': {
      const object = (value as Values) ?? {}
      return (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(160px, 1fr))' } }}>
          {usableParts(input.parts, context, entity, field).map((child) => (
            <FieldEditor
              key={child.key}
              part={child}
              entity={entity}
              field={field}
              value={object[child.key]}
              onChange={(next) => onChange({ ...object, [child.key]: next })}
              context={context}
            />
          ))}
        </Box>
      )
    }
    case 'rows': {
      const rows = (value as Values[]) ?? []
      const parts = usableParts(input.parts, context, entity, field)
      return (
        <Stack spacing={1}>
          {rows.map((row, index) => (
            <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(130px, 1fr))' } }}>
                {parts.map((child) => (
                  <FieldEditor
                    key={child.key}
                    part={child}
                    entity={entity}
                    field={field}
                    value={row[child.key]}
                    onChange={(next) => onChange(rows.map((other, position) => (position === index ? { ...other, [child.key]: next } : other)))}
                    context={context}
                  />
                ))}
              </Box>
              <IconButton size="small" aria-label="Zeile entfernen" onClick={() => onChange(rows.filter((_, position) => position !== index))}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, { ...input.defaults }])}>
            {input.addLabel}
          </Button>
        </Stack>
      )
    }
    case 'auto':
      return (
        <Typography variant="body2" color="text.secondary">
          Wird automatisch gesetzt.
        </Typography>
      )
  }
}
