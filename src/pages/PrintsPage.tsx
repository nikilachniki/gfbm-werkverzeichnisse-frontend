import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import { DataGrid, type GridColDef, type GridRenderCellParams, type GridRowParams } from '@mui/x-data-grid'
import { FilterBar, type FilterField } from '../search/FilterBar.tsx'
import { multiField, textField, yearRangeField } from '../search/filterFields.tsx'
import { defaultPrintsFilters, filterPrints, printSummaries, type PrintsFilters } from '../search/filterPrints.ts'
import { Highlight } from '../search/Highlight.tsx'
import { RismBadge } from '../components/PrintRism.tsx'
import type { Print } from '../types.ts'
import { getPerson, printPath, printRism, textAuthorSearchNames } from '../worksData.ts'

interface Row {
  id: string
  siglum: string
  shortTitle: string
  description: string
  print: Print
  // RISM-Nummer als Text, fuer Sortierung und Export; angezeigt wird das Abzeichen
  rism: string
  workCount: number
  firstPrintCount: number
  voiceCounts: string
  languages: string
}

// Sigel wie "1555-1" und "1555-10" bzw. "1575-3/III" numerisch vergleichen,
// damit die Drucke chronologisch und nach laufender Nummer stehen.
const siglumComparator = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true })

const hasRism = printSummaries.some((summary) => printRism(summary.print)?.url)

function collect<T>(pick: (summary: (typeof printSummaries)[number]) => T[]): T[] {
  return Array.from(new Set(printSummaries.flatMap(pick)))
}

// Wie bei den Werken: angezeigt wird die festgelegte Schreibweise, die Eingabe
// trifft auch die Varianten.
const authorLabel = (id: string) => getPerson(id)?.preferredName ?? id
const filterAuthorOptions = createFilterOptions<string>({
  stringify: (id) => textAuthorSearchNames(id).join(' '),
})

const languageOptions = collect((summary) => summary.languages).sort((a, b) => a.localeCompare(b, 'de'))

const fields: FilterField<PrintsFilters>[] = [
  textField('siglum', 'Sigel', 'z. B. 1555-1', 140),
  yearRangeField('yearFrom', 'yearTo', 'Jahr'),
  textField('description', 'Beschreibung', 'z. B. Nachdruck', 180),
  textField('printTitle', 'Drucktitel', 'z. B. Madrigali', 200),
  textField('references', 'Verweis', 'z. B. Boetticher 1567', 200),
  textField('lv', 'Enthält LV-Nummer', 'z. B. 100 oder 100-2', 150),
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
  ...(languageOptions.length > 0
    ? [multiField<PrintsFilters, string>('languages', 'Sprache', languageOptions)]
    : []),
]

function createColumns(query: string): GridColDef<Row>[] {
  const highlighted = (field: 'siglum' | 'description' | 'languages') => ({
    renderCell: (params: GridRenderCellParams<Row>) => <Highlight text={params.row[field]} query={query} />,
  })
  return [
    { field: 'siglum', headerName: 'Sigel', width: 120, sortComparator: siglumComparator, ...highlighted('siglum') },
    {
      field: 'shortTitle',
      headerName: 'Kurztitel',
      flex: 3,
      minWidth: 240,
      renderCell: (params: GridRenderCellParams<Row>) => (
        <Box
          component="span"
          title={params.row.shortTitle}
          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          <Highlight text={params.row.shortTitle} query={query} />
        </Box>
      ),
    },
    {
      field: 'description',
      headerName: 'Beschreibung',
      flex: 2,
      minWidth: 220,
      renderCell: (params: GridRenderCellParams<Row>) => (
        <Box
          component="span"
          title={params.row.description}
          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          <Highlight text={params.row.description} query={query} />
        </Box>
      ),
    },
    ...(hasRism
      ? [
          {
            field: 'rism',
            headerName: 'RISM',
            width: 80,
            renderCell: (params: GridRenderCellParams<Row>) => <RismBadge print={params.row.print} />,
          },
        ]
      : []),
    { field: 'workCount', headerName: 'Werke', type: 'number', width: 80 },
    {
      field: 'firstPrintCount',
      headerName: 'Erstdrucke',
      description: 'Werke, die in diesem Druck zum ersten Mal erschienen sind',
      type: 'number',
      width: 100,
    },
    { field: 'voiceCounts', headerName: 'Stimmen', width: 110 },
    { field: 'languages', headerName: 'Sprache', flex: 1, minWidth: 120, ...highlighted('languages') },
  ]
}

interface PrintsPageProps {
  filters: PrintsFilters
  onFiltersChange: (filters: PrintsFilters) => void
}

export function PrintsPage({ filters, onFiltersChange }: PrintsPageProps) {
  const navigate = useNavigate()

  const rows = useMemo<Row[]>(
    () =>
      filterPrints(printSummaries, filters).map((summary) => ({
        id: summary.print['@id'],
        siglum: summary.print.siglum,
        shortTitle: summary.print.shortTitle ?? '',
        description: summary.print.description ?? '',
        print: summary.print,
        rism: printRism(summary.print)?.label ?? '',
        workCount: summary.contents.length,
        firstPrintCount: summary.print.entryCount,
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
        defaultFilters={defaultPrintsFilters}
        fields={fields}
        placeholder="Drucke durchsuchen – Kurztitel, Sigel, Jahr, Beschreibung, Titelblatt, Verweise …"
      />
      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          // Ohne gewaehlte Spalte bleibt die Reihenfolge von filterPrints: nach
          // Relevanz bei aktiver Suche, sonst nach Sigel.
          initialState={{
            pagination: { paginationModel: { pageSize: 100 } },
          }}
          pageSizeOptions={[25, 50, 100]}
          density="compact"
          disableRowSelectionOnClick
          onRowClick={(params: GridRowParams<Row>) => navigate(printPath(params.row.siglum))}
          sx={{
            flex: 1,
            border: 0,
            '& .MuiTablePagination-toolbar': { minHeight: 40 },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { margin: 0 },
            '& .MuiDataGrid-row': { cursor: 'pointer' },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
            '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
              outline: 'none',
            },
          }}
        />
      </Paper>
    </Container>
  )
}
