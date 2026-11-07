import { hideEmptyColumns } from '../emptyColumns.ts'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import { DataGrid, type GridColDef, type GridRenderCellParams, type GridRowParams } from '@mui/x-data-grid'
import { FilterBar, type FilterField } from '../search/FilterBar.tsx'
import { multiField, textField, yearRangeField } from '../search/filterFields.tsx'
import { defaultSourcesFilters, filterSources, sourceSummaries, type SourcesFilters } from '../search/filterSources.ts'
import { Highlight } from '../search/Highlight.tsx'
import { RismBadge } from '../components/SourceRism.tsx'
import type { Source, SourceKind } from '../types.ts'
import {
  catalogue,
  compareNatural,
  getPerson,
  SOURCE_KIND_LABELS,
  sourcePath,
  textAuthorSearchNames,
} from '../catalogueData.ts'

interface Row {
  id: string
  kind: string
  siglum: string
  title: string
  description: string
  source: Source
  rism: string
  dateLabel: string
  workCount: number
  earliestCount: number
  voiceCounts: string
  languages: string
}

const hasRism = sourceSummaries.some((summary) => summary.source.rismUrl)

function collect<T>(pick: (summary: (typeof sourceSummaries)[number]) => T[]): T[] {
  return Array.from(new Set(sourceSummaries.flatMap(pick)))
}

// Angezeigt wird die festgelegte Schreibweise, die Eingabe trifft auch die Varianten.
const authorLabel = (id: string) => getPerson(id)?.preferredName ?? id
const filterAuthorOptions = createFilterOptions<string>({
  stringify: (id) => textAuthorSearchNames(id).join(' '),
})

const languageOptions = collect((summary) => summary.languages).sort((a, b) => a.localeCompare(b, 'de'))
const kindOptions = collect((summary) => [summary.source.kind])

const fields: FilterField<SourcesFilters>[] = [
  multiField<SourcesFilters, SourceKind>('kinds', 'Art', kindOptions, {
    getOptionLabel: (kind) => SOURCE_KIND_LABELS[kind],
  }),
  textField('siglum', 'Sigle', 'z. B. 1555-1', 140),
  yearRangeField('yearFrom', 'yearTo', 'Jahr'),
  textField('description', 'Beschreibung', 'z. B. Nachdruck', 180),
  textField('sourceTitle', 'Titel der Quelle', 'z. B. Madrigali', 200),
  textField('references', 'Verweis', 'z. B. Boetticher 1567', 200),
  textField('number', `Enthält ${catalogue.catalogueAbbreviation}-Nummer`, 'z. B. 100 oder 100-2', 150),
  textField('title', 'Enthält Titel', 'z. B. Passio', 200),
  multiField(
    'textAuthors',
    'Textdichter',
    collect((summary) => summary.textAuthors).sort((a, b) => authorLabel(a).localeCompare(authorLabel(b), 'de')),
    { getOptionLabel: authorLabel, filterOptions: filterAuthorOptions, sx: { minWidth: 240 } },
  ),
  multiField(
    'voiceCounts',
    'Stimmen',
    collect((summary) => summary.voiceCounts).sort((a, b) => a - b),
    { getOptionLabel: (option) => String(option) },
  ),
  ...(languageOptions.length > 0 ? [multiField<SourcesFilters, string>('languages', 'Sprache', languageOptions)] : []),
]

function createColumns(query: string): GridColDef<Row>[] {
  const highlighted = (field: 'siglum' | 'languages') => ({
    renderCell: (params: GridRenderCellParams<Row>) => <Highlight text={params.row[field]} query={query} />,
  })
  const truncated = (field: 'title' | 'description') => ({
    renderCell: (params: GridRenderCellParams<Row>) => (
      <Box
        component="span"
        title={params.row[field]}
        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <Highlight text={params.row[field]} query={query} />
      </Box>
    ),
  })
  return [
    { field: 'kind', headerName: 'Art', width: 110 },
    { field: 'siglum', headerName: 'Sigle', width: 170, sortComparator: compareNatural, ...highlighted('siglum') },
    { field: 'title', headerName: 'Titel', flex: 3, minWidth: 240, ...truncated('title') },
    { field: 'description', headerName: 'Beschreibung', flex: 2, minWidth: 200, ...truncated('description') },
    ...(hasRism
      ? [
          {
            field: 'rism',
            headerName: 'RISM',
            width: 80,
            renderCell: (params: GridRenderCellParams<Row>) => <RismBadge source={params.row.source} />,
          },
        ]
      : []),
    { field: 'dateLabel', headerName: 'Datierung', width: 100 },
    { field: 'workCount', headerName: 'Werke', type: 'number', width: 80 },
    {
      field: 'earliestCount',
      headerName: 'Zuerst belegt',
      description: 'Werke, deren frühester Druck dieser Druck ist, aus dem Datum abgeleitet',
      type: 'number',
      width: 120,
    },
    { field: 'voiceCounts', headerName: 'Stimmen', width: 110 },
    { field: 'languages', headerName: 'Sprache', flex: 1, minWidth: 120, ...highlighted('languages') },
  ]
}

// Leere Spalten starten ausgeblendet, siehe emptyColumns.ts.
const HIDDEN_EMPTY_COLUMNS = hideEmptyColumns(
  sourceSummaries.map((summary) => ({
    description: summary.source.description ?? '',
    rism: summary.source.rismLabel ?? '',
    dateLabel: summary.source.dateLabel,
    voiceCounts: summary.voiceCounts,
    languages: summary.languages,
  })),
  ['description', 'rism', 'dateLabel', 'voiceCounts', 'languages'],
)

interface SourcesPageProps {
  filters: SourcesFilters
  onFiltersChange: (filters: SourcesFilters) => void
}

export function SourcesPage({ filters, onFiltersChange }: SourcesPageProps) {
  const navigate = useNavigate()

  const rows = useMemo<Row[]>(
    () =>
      filterSources(sourceSummaries, filters).map((summary) => ({
        id: summary.source['@id'],
        kind: SOURCE_KIND_LABELS[summary.source.kind],
        siglum: summary.source.siglum,
        title: summary.source.title === summary.source.siglum ? '' : summary.source.title,
        description: summary.source.description ?? '',
        source: summary.source,
        rism: summary.source.rismLabel ?? '',
        dateLabel: summary.source.dateLabel,
        workCount: summary.contents.length,
        earliestCount: new Set(
          summary.contents.filter((content) => content.isEarliestPrint).map(({ work }) => work['@id']),
        ).size,
        voiceCounts: summary.voiceCounts.join(', '),
        languages: summary.languages.join(', '),
      })),
    [filters],
  )

  const columns = useMemo(() => createColumns(filters.query), [filters.query])

  return (
    <Container
      maxWidth="xl"
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', py: { xs: 1.5, sm: 2 } }}
    >
      <FilterBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        defaultFilters={defaultSourcesFilters}
        fields={fields}
        placeholder="Quellen durchsuchen – Titel, Sigle, Jahr, Beschreibung, Bibliothek, Verweise …"
      />
      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          // Ohne gewaehlte Spalte bleibt die Reihenfolge von filterSources: nach
          // Relevanz bei aktiver Suche, sonst nach Sigle.
          initialState={{ pagination: { paginationModel: { pageSize: 100 } }, columns: { columnVisibilityModel: HIDDEN_EMPTY_COLUMNS } }}
          pageSizeOptions={[25, 50, 100]}
          density="compact"
          disableRowSelectionOnClick
          onRowClick={(params: GridRowParams<Row>) => navigate(sourcePath(params.row.source))}
          sx={{
            flex: 1,
            border: 0,
            '& .MuiTablePagination-toolbar': { minHeight: 40 },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { margin: 0 },
            '& .MuiDataGrid-row': { cursor: 'pointer' },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
            '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
          }}
        />
      </Paper>
    </Container>
  )
}
