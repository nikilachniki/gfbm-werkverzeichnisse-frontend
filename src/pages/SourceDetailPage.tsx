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
import { CitationChips } from '../components/CitationChips.tsx'
import { ExternalChip } from '../components/ExternalChip.tsx'
import { Fact } from '../components/Fact.tsx'
import { Section } from '../components/Section.tsx'
import { SourceRism } from '../components/SourceRism.tsx'
import { SourceReferences, SourceTitlePage, TextWithSourceLinks } from '../components/SourceText.tsx'
import { authorOrSourceLabel, AuthorOrSourceText } from '../helpers.tsx'
import type { UnassignedPiece, WorkInSource } from '../types.ts'
import {
  catalogue,
  findSourceBySlug,
  getSourceContents,
  getUnassignedPieces,
  noteText,
  SOURCE_KIND_LABELS,
  textAuthorLabels,
  workLink,
} from '../catalogueData.ts'

// Die Stuecke einer Quelle in ihrer Reihenfolge. Titel und Stimmenzahl der Quelle
// stehen, wo sie abweichen, beim Stueck. Ein Klick fuehrt zum Werk.
function ContentsTable({ contents }: { contents: WorkInSource[] }) {
  const navigate = useNavigate()
  const works = contents.map(({ work }) => work)
  const authorOrSourceHeader = authorOrSourceLabel(
    works.some((work) => work.textAuthors.length > 0),
    works.some((work) => work.textSources.length > 0),
  )
  const hasPositions = contents.some((content) => content.position || content.part)
  const hasDatings = contents.some((content) => content.dating)
  const hasNotes = contents.some((content) => content.note)
  const hasLanguages = works.some((work) => work.languages.length > 0)

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {hasPositions && <TableCell>Nr.</TableCell>}
            <TableCell>{catalogue.catalogueAbbreviation}</TableCell>
            <TableCell>Werktitel</TableCell>
            <TableCell>Stimmen</TableCell>
            <TableCell>{authorOrSourceHeader}</TableCell>
            <TableCell>Ausgaben</TableCell>
            {hasLanguages && <TableCell>Sprache</TableCell>}
            {hasDatings && <TableCell>Datierung</TableCell>}
            {hasNotes && <TableCell>Bemerkung</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {contents.map((content, index) => {
            const { work, version } = content
            const link = workLink(work)
            const shownTitle = version?.title ?? work.title
            const inSource = content.titleInSource && content.titleInSource !== shownTitle ? content.titleInSource : null
            return (
              <TableRow
                key={`${work['@id']}|${index}`}
                hover
                onClick={() => navigate(link.to, { state: link.state })}
                sx={{ cursor: 'pointer' }}
              >
                {hasPositions && (
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {[content.position, content.part ? `Teil ${content.part}` : null].filter(Boolean).join(', ')}
                  </TableCell>
                )}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {version?.number || work.number}
                  {content.isEarliestPrint && (
                    <Tooltip title="Frühester Druck: aus dem Datum abgeleitet, hier ist das Werk oder ein Teil davon zuerst belegt">
                      <Chip label="Frühester Druck" size="small" variant="outlined" sx={{ ml: 1 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  {shownTitle}
                  {inSource && (
                    <Typography variant="body2" color="text.secondary">
                      In der Quelle: {inSource}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{content.voices ?? (version ?? work).voiceCounts.join(', ')}</TableCell>
                <TableCell>
                  <AuthorOrSourceText authors={textAuthorLabels(work)} sources={work.textSources} />
                </TableCell>
                <TableCell>
                  <CitationChips item={version ?? work} />
                </TableCell>
                {hasLanguages && <TableCell>{work.languages.join(', ')}</TableCell>}
                {hasDatings && <TableCell>{content.dating}</TableCell>}
                {hasNotes && <TableCell>{content.note}</TableCell>}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// Stuecke, die keinem Werk zugeordnet sind. Sie haben keine Werknummer und keinen
// Komponisten und fuehren deshalb nirgendwohin.
function UnassignedTable({ pieces }: { pieces: UnassignedPiece[] }) {
  const hasPositions = pieces.some((piece) => piece.position || piece.part)
  const hasVoices = pieces.some((piece) => piece.voices !== null)
  const hasDatings = pieces.some((piece) => piece.dating)
  const hasNotes = pieces.some((piece) => piece.note)
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {hasPositions && <TableCell>Nr.</TableCell>}
            <TableCell>Titel in der Quelle</TableCell>
            {hasVoices && <TableCell>Stimmen</TableCell>}
            {hasDatings && <TableCell>Datierung</TableCell>}
            {hasNotes && <TableCell>Bemerkung</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {pieces.map((piece, index) => (
            <TableRow key={index}>
              {hasPositions && (
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {[piece.position, piece.part ? `Teil ${piece.part}` : null].filter(Boolean).join(', ')}
                </TableCell>
              )}
              <TableCell>{piece.title}</TableCell>
              {hasVoices && <TableCell>{piece.voices}</TableCell>}
              {hasDatings && <TableCell>{piece.dating}</TableCell>}
              {hasNotes && <TableCell>{piece.note}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function ItemLinks({ links }: { links: string[] }) {
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
      {links.map((link) => (
        <ExternalChip key={link} label="Online-Katalog" href={link} tooltip={link} />
      ))}
    </Stack>
  )
}

export function SourceDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const source = slug ? findSourceBySlug(slug) : undefined

  if (!source) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Quelle nicht gefunden.</Alert>
        <Box sx={{ mt: 2 }}>
          <BackButton overviewPath="/quellen" />
        </Box>
      </Container>
    )
  }

  const contents = getSourceContents(source)
  const unassigned = getUnassignedPieces(source)
  const hasRism = Boolean(source.rismLabel || source.rismUrl)
  // Je Werk einmal, auch wenn es zusaetzlich als Fassung im selben Druck steht
  const earliestCount = new Set(contents.filter((content) => content.isEarliestPrint).map(({ work }) => work['@id'])).size
  // Eine Handschrift ist ihr einziges Exemplar: dessen Angaben stehen direkt bei ihr.
  const manuscriptItem = source.kind === 'manuscript' ? source.items[0] : undefined
  const separateItems = manuscriptItem ? source.items.slice(1) : source.items

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <BackButton overviewPath="/quellen" />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Chip label={SOURCE_KIND_LABELS[source.kind]} size="small" sx={{ fontWeight: 700 }} />
        </Stack>
        <Typography variant="h4" component="h2">
          {source.title || source.siglum}
          {source.title && source.title !== source.siglum && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' '}
              ({source.siglum})
            </Box>
          )}
        </Typography>
        {source.description && (
          <Typography variant="subtitle1" component="p" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
            <TextWithSourceLinks text={source.description} />
          </Typography>
        )}

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
          {manuscriptItem && (
            <>
              <Fact label="Ort" labelWidth={120} value={manuscriptItem.place ?? ''} />
              <Fact
                label="Bibliothek"
                labelWidth={120}
                value={[manuscriptItem.librarySiglum, manuscriptItem.library].filter(Boolean).join(', ')}
              />
              <Fact label="Signatur" labelWidth={120} value={manuscriptItem.shelfmark ?? ''} />
              <Fact label="Frühere Signatur" labelWidth={120} value={manuscriptItem.formerShelfmark ?? ''} />
              <Fact
                label="Katalog"
                labelWidth={120}
                value={manuscriptItem.links.length > 0 ? <ItemLinks links={manuscriptItem.links} /> : ''}
              />
            </>
          )}
          <Fact label="Datierung" labelWidth={120} value={source.dateLabel} />
          <Fact label="Ort" labelWidth={120} value={source.place ?? ''} />
          <Fact label="Verlag" labelWidth={120} value={source.publisher ?? ''} />
          <Fact
            label="Werke"
            labelWidth={120}
            value={earliestCount > 0 ? `${contents.length}, davon ${earliestCount} hier zuerst belegt` : contents.length}
          />
          <Fact label="Quellenart" labelWidth={120} value={source.sourceType ?? ''} />
          <Fact label="Stimmbücher" labelWidth={120} value={source.partbooks ?? ''} />
          <Fact label="RISM" labelWidth={120} value={hasRism ? <SourceRism source={source} /> : ''} />
          {source.notes.map((note) => (
            <Fact key={note.html} label={note.label ?? 'Anmerkung'} labelWidth={120} value={noteText(note)} />
          ))}
          <Fact label="Literatur" labelWidth={120} value={source.literature.join(' ')} />
        </Box>

        {source.titlePage && (
          // Als einziger Abschnitt offen: das Titelblatt ist die Hauptangabe der Quelle
          <Section title="Titelblatt" defaultExpanded>
            <Box sx={{ maxWidth: 640, mx: 'auto' }}>
              <SourceTitlePage title={source.titlePage} />
            </Box>
          </Section>
        )}

        {separateItems.length > 0 && (
          <Section title="Exemplare" count={separateItems.length}>
            <Stack spacing={2}>
              {separateItems.map((item) => (
                <Stack key={item['@id']} spacing={1}>
                  <Fact label="Ort" labelWidth={120} value={item.place ?? ''} />
                  <Fact
                    label="Bibliothek"
                    labelWidth={120}
                    value={[item.librarySiglum, item.library].filter(Boolean).join(', ')}
                  />
                  <Fact label="Signatur" labelWidth={120} value={item.shelfmark ?? ''} />
                  <Fact label="Frühere Signatur" labelWidth={120} value={item.formerShelfmark ?? ''} />
                  <Fact
                    label="Katalog"
                    labelWidth={120}
                    value={item.links.length > 0 ? <ItemLinks links={item.links} /> : ''}
                  />
                </Stack>
              ))}
            </Stack>
          </Section>
        )}

        {contents.length > 0 && (
          // Ohne Titelblatt ist das die Hauptangabe der Quelle und deshalb offen.
          <Section title="Enthaltene Werke" count={contents.length} defaultExpanded={!source.titlePage}>
            <Box sx={{ overflowX: 'auto' }}>
              <ContentsTable contents={contents} />
            </Box>
          </Section>
        )}

        {unassigned.length > 0 && (
          <Section title="Stücke ohne Werkzuordnung" count={unassigned.length}>
            <Box sx={{ overflowX: 'auto' }}>
              <UnassignedTable pieces={unassigned} />
            </Box>
          </Section>
        )}

        {source.references.length > 0 && (
          <Section title="Weitere Verweise" count={source.references.length}>
            <SourceReferences references={source.references} />
          </Section>
        )}
      </Paper>
    </Container>
  )
}
