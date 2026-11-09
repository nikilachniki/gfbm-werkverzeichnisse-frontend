import Autocomplete, { type AutocompleteProps } from '@mui/material/Autocomplete'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { FilterField } from './FilterBar'

// Bausteine fuer die Felddefinitionen der Filterleiste, siehe FilterBar.
// Die Schluessel muessen im jeweiligen Filtertyp auf den passenden Werttyp
// zeigen (Text, Liste bzw. Jahr von/bis).

type KeysOfType<F, T> = { [K in keyof F]: F[K] extends T ? K : never }[keyof F] & string

export function textField<F>(
  key: KeysOfType<F, string>,
  label: string,
  placeholder: string,
  minWidth = 160,
): FilterField<F> {
  return {
    key,
    label,
    isActive: (filters) => (filters[key] as string).trim() !== '',
    clear: (filters) => ({ ...filters, [key]: '' }),
    render: (filters, onChange) => (
      <TextField
        size="small"
        placeholder={placeholder}
        value={filters[key]}
        onChange={(event) => onChange({ ...filters, [key]: event.target.value })}
        sx={{ minWidth }}
      />
    ),
  }
}

export function multiField<F, T>(
  key: KeysOfType<F, T[]>,
  label: string,
  options: T[],
  extra: Partial<AutocompleteProps<T, true, false, false>> = {},
): FilterField<F> {
  return {
    key,
    label,
    isActive: (filters) => (filters[key] as T[]).length > 0,
    clear: (filters) => ({ ...filters, [key]: [] }),
    render: (filters, onChange) => (
      <Autocomplete
        multiple
        size="small"
        options={options}
        value={filters[key] as T[]}
        onChange={(_, value) => onChange({ ...filters, [key]: value })}
        renderInput={(params) => <TextField {...params} placeholder="Alle" />}
        sx={{ minWidth: 200 }}
        {...extra}
      />
    ),
  }
}

// Jahr von/bis. Ein leeres Feld laesst die Spanne nach dieser Seite offen,
// "1560" bis "" heisst also ab 1560.
export function yearRangeField<F>(
  fromKey: KeysOfType<F, string>,
  toKey: KeysOfType<F, string>,
  label: string,
): FilterField<F> {
  const input = (filters: F, onChange: (filters: F) => void, key: KeysOfType<F, string>, placeholder: string) => (
    <TextField
      size="small"
      placeholder={placeholder}
      value={filters[key]}
      onChange={(event) => onChange({ ...filters, [key]: event.target.value.replace(/\D/g, '') })}
      slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4, 'aria-label': `${label} ${placeholder}` } }}
      sx={{ width: 80 }}
    />
  )
  return {
    key: fromKey,
    label,
    isActive: (filters) => filters[fromKey] !== '' || filters[toKey] !== '',
    clear: (filters) => ({ ...filters, [fromKey]: '', [toKey]: '' }),
    render: (filters, onChange) => (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {input(filters, onChange, fromKey, 'von')}
        <Typography variant="body2" color="text.secondary">
          –
        </Typography>
        {input(filters, onChange, toKey, 'bis')}
      </Stack>
    ),
  }
}

// Prueft ein Jahr gegen eine Spanne aus den Filterfeldern (Text, ggf. leer)
// Ein Zeitraum trifft, sobald er sich mit dem gesuchten ueberschneidet.
export function inYearRange(period: { from: number; to: number } | null, from: string, to: string): boolean {
  if (from === '' && to === '') {
    return true
  }
  if (period === null) {
    return false
  }
  return (from === '' || period.to >= Number(from)) && (to === '' || period.from <= Number(to))
}

// Suche nach der Katalognummer: eine genaue Nummer oder eine Nummer mit ihren
// Teilen ("100" findet 100 und 100-2). Ein Teiltreffer wie bei der freien Suche
// waere hier unbrauchbar, "10" fuehrte sonst auch zu 100, 210 usw.
export function matchesNumber(number: string, input: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase('de-DE').replace(/\s+/g, '')
  const value = normalize(input)
  const candidate = normalize(number)
  return candidate === value || candidate.startsWith(`${value}-`)
}
