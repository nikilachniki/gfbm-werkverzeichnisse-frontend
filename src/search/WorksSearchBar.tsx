import { useMemo } from 'react'
import { createFilterOptions } from '@mui/material/Autocomplete'
import { getPerson, textAuthorSearchNames } from '../worksData'
import { FilterBar, type FilterField } from './FilterBar'
import { multiField, textField, yearRangeField } from './filterFields'
import { defaultWorksFilters, type WorksFilters } from './filterWorks'

// Die Optionen sind Personen-IDs. Angezeigt wird die festgelegte Schreibweise,
// die Eingabe trifft aber auch die Varianten: "C.Marot" findet Clément Marot.
const authorLabel = (id: string) => getPerson(id)?.preferredName ?? id
const filterAuthorOptions = createFilterOptions<string>({
  stringify: (id) => textAuthorSearchNames(id).join(' '),
})

interface WorksSearchBarProps {
  filters: WorksFilters
  onFiltersChange: (filters: WorksFilters) => void
  authorOptions: string[]
  voiceCountOptions: number[]
  languageOptions: string[]
  resultCount: number
  totalCount: number
}

export function WorksSearchBar({
  filters,
  onFiltersChange,
  authorOptions,
  voiceCountOptions,
  languageOptions,
}: WorksSearchBarProps) {
  const fields = useMemo<FilterField<WorksFilters>[]>(
    () => [
      textField('lv', 'LV-Nummer', 'z. B. 100 oder 100-2', 150),
      textField('title', 'Titel', 'z. B. Passio', 200),
      multiField('textAuthors', 'Textdichter', authorOptions, {
        getOptionLabel: authorLabel,
        filterOptions: filterAuthorOptions,
        sx: { minWidth: 240 },
      }),
      textField('textSources', 'Textprovenienz', 'z. B. Ps 6', 180),
      multiField('voiceCounts', 'Stimmen', voiceCountOptions, { getOptionLabel: (option) => String(option) }),
      textField('prints', 'Drucke', 'z. B. 1555-1'),
      yearRangeField('yearFrom', 'yearTo', 'Druckjahr'),
      textField('editions', 'Gesamtausgabe', 'z. B. GA XIX', 180),
      // Die Sprache ist in den Daten noch nicht durchgehend erfasst;
      // ein Filter ohne einen einzigen Wert wuerde nur eine leere Auswahl zeigen.
      ...(languageOptions.length > 0
        ? [multiField<WorksFilters, string>('languages', 'Sprache', languageOptions)]
        : []),
      textField('manuscripts', 'Handschrift (RISM-Sigel)', 'z. B. D-Mbs', 180),
    ],
    [authorOptions, voiceCountOptions, languageOptions],
  )

  return (
    <FilterBar
      filters={filters}
      onFiltersChange={onFiltersChange}
      defaultFilters={defaultWorksFilters}
      fields={fields}
      placeholder="Werke durchsuchen – Titel, LV-Nummer, Textdichter, Drucke, Gesamtausgabe …"
    />
  )
}
