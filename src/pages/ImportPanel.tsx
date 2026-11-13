import { useMemo, useState, type ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { download, readWorkbook, templateFile } from '../baukasten/excel.ts'
import { slug, type Draft } from '../baukasten/generate.ts'
import { importSheets, templateSheets, type Issue, type SheetInput } from '../baukasten/importSheets.ts'
import type { Config } from '../baukasten/model.ts'

// Batch-Import aus Excel: Vorlage passend zur Einrichtung herunterladen, ausfuellen, hochladen.
// Uebernommen wird erst nach der Vorschau, gespeichert dann wie jede andere Aenderung.

// Mehr Meldungen auf einmal hilft niemandem, die Datei hat dann ein grundsaetzliches Problem.
const SHOWN_ISSUES = 100
const SHOWN_NAMES = 40

const issueText = (issue: Issue): string =>
  [issue.sheet, issue.row !== undefined && `Zeile ${issue.row}`, issue.column && `„${issue.column}“`].filter(Boolean).join(', ') + `: ${issue.text}`

export function ImportPanel({ config, draft, onDraft }: { config: Config; draft: Draft; onDraft: (next: Draft) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [upload, setUpload] = useState<{ name: string; sheets: SheetInput[] } | null>(null)
  const [done, setDone] = useState('')
  // Rechnet neu, wenn sich nebenbei etwas aendert; die Vorschau stimmt so immer.
  const result = useMemo(() => (upload ? importSheets(config, draft, upload.sheets) : null), [config, draft, upload])

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

  const downloadTemplate = () =>
    run(async () => {
      const label = config.catalogue.label.trim()
      const blob = await templateFile(label, templateSheets(config))
      download(blob, `${slug(config.catalogue.abbreviation.trim() || label || 'werkverzeichnis').toLowerCase()}-import-vorlage.xlsx`)
    })

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Dieselbe Datei soll sich nach dem Korrigieren erneut waehlen lassen.
    event.target.value = ''
    if (!file) {
      return
    }
    setDone('')
    setUpload(null)
    void run(async () => setUpload({ name: file.name, sheets: await readWorkbook(file) }))
  }

  const apply = () => {
    if (!result) {
      return
    }
    onDraft(result.draft)
    setDone(`${result.total} Datensätze aus „${upload!.name}“ übernommen. Sie liegen jetzt in diesem Browser; links mit „Nach GitHub speichern“ sichern.`)
    setUpload(null)
  }

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h3">
          1. Vorlage herunterladen
        </Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} disabled={busy} onClick={downloadTemplate} sx={{ mt: 2 }}>
          Excel-Vorlage herunterladen
        </Button>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h3">
          2. Ausgefüllte Datei hochladen
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 2 }}>
          <Button variant="contained" component="label" startIcon={<UploadFileIcon />} disabled={busy}>
            Datei wählen
            <input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
          </Button>
          {busy && <CircularProgress size={20} />}
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {done && (
        <Alert severity="success" onClose={() => setDone('')}>
          {done}
        </Alert>
      )}

      {upload && result && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" component="h3">
            Vorschau: {upload.name}
          </Typography>
          <Stack spacing={2} sx={{ mt: 1.5 }}>
            {result.total === 0 && result.errors.length === 0 && <Alert severity="info">In der Datei stehen keine neuen Datensätze.</Alert>}
            {result.added.length > 0 && (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {result.added.map((group) => (
                  <Chip key={group.entity} label={`${group.label}: ${group.count} neu`} />
                ))}
              </Stack>
            )}
            {result.errors.length > 0 && (
              <Alert severity="error">
                {result.errors.length === 1 ? 'Ein Problem' : `${result.errors.length} Probleme`}. Bitte in der Datei beheben und erneut hochladen.
                <Box component="ul" tabIndex={0} sx={{ m: 0, mt: 1, pl: 2.5, maxHeight: 320, overflow: 'auto', fontSize: 13 }}>
                  {result.errors.slice(0, SHOWN_ISSUES).map((issue, index) => (
                    <li key={index}>{issueText(issue)}</li>
                  ))}
                  {result.errors.length > SHOWN_ISSUES && <li>… und {result.errors.length - SHOWN_ISSUES} weitere</li>}
                </Box>
              </Alert>
            )}
            {result.notes.map((note) => (
              <Alert key={note} severity="info">
                {note}
              </Alert>
            ))}
            {result.added.map((group) => (
              <Box key={group.entity}>
                <Typography variant="subtitle2" component="h4">
                  {group.label}
                  {group.created > 0 && (
                    <Typography component="span" variant="body2" color="text.secondary">
                      {' '}
                      (davon {group.created} automatisch angelegt)
                    </Typography>
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {group.names.slice(0, SHOWN_NAMES).join(' · ')}
                  {group.names.length > SHOWN_NAMES && ` · … und ${group.names.length - SHOWN_NAMES} weitere`}
                </Typography>
              </Box>
            ))}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={result.errors.length > 0 || result.total === 0} onClick={apply}>
                {result.total > 0 ? `${result.total} Datensätze übernehmen` : 'Übernehmen'}
              </Button>
              <Button onClick={() => setUpload(null)}>Verwerfen</Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
