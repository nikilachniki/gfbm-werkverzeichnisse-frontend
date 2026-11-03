import { useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { BackButton } from '../components/BackButton.tsx'
import { EditionChips } from '../components/EditionChips.tsx'
import { Fact } from '../components/Fact.tsx'
import { PrintRism } from '../components/PrintRism.tsx'
import { PrintReferences, PrintTitlePage, TextWithPrintLinks } from '../components/PrintText.tsx'
import { Section } from '../components/Section.tsx'
import { WorkTitle } from '../components/WorkTitle.tsx'
import { authorOrSourceLabel, AuthorOrSourceText } from '../helpers.tsx'
import {
  findPrintBySiglum,
  formatCatalogNumber,
  formatPrintYear,
  getPrintContents,
  mainTitle,
  printReferences,
  printRism,
  textAuthorLabels,
  workSlug,
  type WorkInPrint,
} from '../worksData.ts'

// Die Werke eines Drucks in der Reihenfolge der Stuecke. Die Angaben stammen
// vom Werk, weil Nachdrucke keine eigenen Eintraege haben; der Titel in der
// Schreibung des Drucks steht, wo bekannt und abweichend, grau darunter.
// Ein Klick fuehrt zum Werk.
function PrintContentsTable({ contents }: { contents: WorkInPrint[] }) {
  const navigate = useNavigate()
  const works = contents.map(({ work }) => work)
  const authorOrSourceHeader = authorOrSourceLabel(
    works.some((work) => work.textAuthors.length > 0),
    works.some((work) => work.textSources.length > 0),
  )
  const hasPieces = contents.some((content) => content.piece)
  const hasNotes = contents.some((content) => content.note)
  const hasLanguages = works.some((work) => work.languages.length > 0)

  // Teile haben keine eigene Detailseite, siehe WorksPage.handleRowClick.
  const openWork = ({ work }: WorkInPrint) => {
    if (work.isPartOf) {
      navigate(`/werk/${workSlug({ '@id': work.isPartOf })}`, { state: { focusPart: work['@id'] } })
      return
    }
    navigate(`/werk/${workSlug(work)}`)
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {hasPieces && <TableCell>Nr.</TableCell>}
            <TableCell>LV</TableCell>
            <TableCell>Werktitel</TableCell>
            <TableCell>Stimmen</TableCell>
            <TableCell>{authorOrSourceHeader}</TableCell>
            <TableCell>Gesamtausgabe</TableCell>
            {hasLanguages && <TableCell>Sprache</TableCell>}
            {hasNotes && <TableCell>Zusatz</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {contents.map((content) => {
            const { work, entries } = content
            const printTitles = entries
              .map((entry) => entry.title)
              .filter((title): title is string => Boolean(title) && title !== mainTitle(work))
            return (
              <TableRow
                key={`${work['@id']}|${content.siglum}`}
                hover
                onClick={() => openWork(content)}
                sx={{ cursor: 'pointer' }}
              >
                {hasPieces && <TableCell sx={{ whiteSpace: 'nowrap' }}>{content.piece}</TableCell>}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {work.lv ?? formatCatalogNumber(work)}
                  {entries.length > 0 && (
                    <Tooltip title="Erstdruck: das Werk oder ein Teil davon erschien hier zum ersten Mal">
                      <Chip label="Erstdruck" size="small" variant="outlined" sx={{ ml: 1 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <WorkTitle basis={work.preferredTitleBasis}>{mainTitle(work)}</WorkTitle>
                  {printTitles.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Im Druck: {printTitles.join(' / ')}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{work.voiceCounts.join(', ')}</TableCell>
                <TableCell>
                  <AuthorOrSourceText authors={textAuthorLabels(work)} sources={work.textSources} />
                </TableCell>
                <TableCell>
                  <EditionChips item={work} />
                </TableCell>
                {hasLanguages && <TableCell>{work.languages.join(', ')}</TableCell>}
                {hasNotes && <TableCell>{content.note}</TableCell>}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export function PrintDetailPage() {
  const { siglum } = useParams<{ siglum: string }>()
  const print = siglum ? findPrintBySiglum(siglum) : undefined

  if (!print) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Druck nicht gefunden.</Alert>
        <Box sx={{ mt: 2 }}>
          <BackButton overviewPath="/drucke" />
        </Box>
      </Container>
    )
  }

  const contents = getPrintContents(print)
  const references = printReferences(print)
  // Werke, die hier (ganz oder mit einem Teil) zuerst erschienen; entryCount
  // zaehlt dagegen Eintraege, also Teile einzeln.
  const firstPrintCount = contents.filter((content) => content.entries.length > 0).length

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <BackButton overviewPath="/drucke" />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Chip label="Druck" size="small" sx={{ fontWeight: 700 }} />
          {print.part && <Chip label={`Band ${print.part}`} size="small" variant="outlined" />}
        </Stack>
        <Typography variant="h4" component="h2">
          {print.shortTitle ?? print.siglum}
          {print.shortTitle && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' '}
              ({print.siglum})
            </Box>
          )}
        </Typography>
        {print.description && (
          <Typography variant="subtitle1" component="p" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
            <TextWithPrintLinks text={print.description} />
          </Typography>
        )}

        {/* Die Angaben breit in zwei Spalten, schmal untereinander. Leere
            Angaben fallen weg, die uebrigen ruecken auf. */}
        <Box
          sx={{
            mt: 3,
            mb: 3,
            display: 'grid',
            columnGap: 4,
            rowGap: 1.5,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          <Fact label="Jahr" labelWidth={120} value={formatPrintYear(print)} />
          <Fact
            label="Werke"
            labelWidth={120}
            value={firstPrintCount > 0 ? `${contents.length}, davon ${firstPrintCount} im Erstdruck` : contents.length}
          />
          <Fact label="Stimmbücher" labelWidth={120} value={print.partbooks ?? ''} />
          <Fact label="RISM" labelWidth={120} value={printRism(print) ? <PrintRism print={print} /> : ''} />
        </Box>

        {print.title && (
          // Als einziger Abschnitt offen: das Titelblatt ist die Hauptangabe des Drucks
          <Section title="Titelblatt" defaultExpanded>
            <Box sx={{ maxWidth: 640, mx: 'auto' }}>
              <PrintTitlePage title={print.title} />
            </Box>
          </Section>
        )}

        <Section title="Enthaltene Werke" count={contents.length}>
          <Box sx={{ overflowX: 'auto' }}>
            <PrintContentsTable contents={contents} />
          </Box>
        </Section>

        {references.length > 0 && (
          // Die uebrigen Verzeichnisse sind zweitrangig, deshalb zuletzt.
          <Section title="Weitere Verweise" count={references.length}>
            <PrintReferences references={references} />
          </Section>
        )}
      </Paper>
    </Container>
  )
}
