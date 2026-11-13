import { useMemo } from 'react'
import { createFilterOptions } from '@mui/material/Autocomplete'
import { catalogue, editions, getPerson, sources, textAuthorSearchNames, works } from '../catalogueData'
import { FilterBar, type FilterField } from './FilterBar'
import { multiField, textField, yearRangeField } from './filterFields'
import { defaultWorksFilters, type WorksFilters } from './filterWorks'

// Der Suchtext nennt nur, was das Verzeichnis auch enthaelt.
const SEARCH_HINT = `Werke durchsuchen – ${[
  'Titel',
  `${catalogue.catalogueAbbreviation}-Nummer`,
  works.some((work) => work.textAuthors.length > 0) ? 'Textdichter' : '',
  sources.length > 0 ? 'Quellen' : '',
  editions.length > 0 ? 'Ausgaben' : '',
]
  .filter(Boolean)
  .join(', ')} …`

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
      textField('number', `${catalogue.catalogueAbbreviation}-Nummer`, 'z. B. 100 oder 100-2', 150),
      textField('title', 'Titel', 'z. B. Passio', 200),
      multiField('textAuthors', 'Textdichter', authorOptions, {
        getOptionLabel: authorLabel,
        filterOptions: filterAuthorOptions,
        sx: { minWidth: 240 },
      }),
      textField('textSources', 'Textprovenienz', 'z. B. Ps 6', 180),
      multiField('voiceCounts', 'Stimmen', voiceCountOptions, { getOptionLabel: (option) => String(option) }),
      textField('sources', 'Quellen', 'Sigle oder Bibliothek'),
      yearRangeField('yearFrom', 'yearTo', 'Jahr der Quelle'),
      textField('editions', 'Ausgabe', 'Band oder Nummer', 180),
      // Ein Filter ohne einen einzigen Wert wuerde nur eine leere Auswahl zeigen.
      ...(languageOptions.length > 0
        ? [multiField<WorksFilters, string>('languages', 'Sprache', languageOptions)]
        : []),
    ],
    [authorOptions, voiceCountOptions, languageOptions],
  )

  return (
    <FilterBar
      filters={filters}
      onFiltersChange={onFiltersChange}
      defaultFilters={defaultWorksFilters}
      fields={fields}
      placeholder={SEARCH_HINT}
    />
  )
}
