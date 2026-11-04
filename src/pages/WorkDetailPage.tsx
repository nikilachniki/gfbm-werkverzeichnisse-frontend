import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { BackButton } from '../components/BackButton.tsx'
import { CitationChips } from '../components/CitationChips.tsx'
import { ExternalChip } from '../components/ExternalChip.tsx'
import { Fact } from '../components/Fact.tsx'
import { Section } from '../components/Section.tsx'
import { SiglumChip } from '../components/SiglumChip.tsx'
import { SourceChip } from '../components/SourceChip.tsx'
import { RismBadge } from '../components/SourceRism.tsx'
import { SourceTitlePage, TextWithSourceLinks } from '../components/SourceText.tsx'
import { authorOrSourceLabel, AuthorOrSourceText } from '../helpers.tsx'
import type { Expression, RawNote, Work, WorkInSource } from '../types.ts'
import {
  catalogue,
  findRelatedParts,
  findWholeWork,
  findWorkBySlug,
  formatCatalogNumber,
  getVersions,
  getWorkSources,
  isBaseWork,
  noteText,
  sourcePath,
  textAuthorLabels,
} from '../catalogueData.ts'

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) => {
        if (i % 2 === 0) {
          return part
        }
        // Satzzeichen am Ende gehören meist nicht zur URL
        const url = part.replace(/[.,;:!?)\]]+$/, '')
        const trailing = part.slice(url.length)
        return (
          <span key={i}>
            <ExternalChip label={hostname(url)} href={url} tooltip={url} sx={{ verticalAlign: 'middle' }} />
            {trailing}
          </span>
        )
      })}
    </>
  )
}

const numberHeader = catalogue.catalogueAbbreviation

// focusId: der Teil, ueber den man aus der Werktabelle hierher gekommen ist. Teile
// haben keine eigene Detailseite, deshalb wird er hier markiert.
function RelatedPartsTable({ parts, focusId }: { parts: Work[]; focusId?: string }) {
  const focusRef = useRef<HTMLTableRowElement>(null)
  const authorOrSourceHeader = authorOrSourceLabel(
    parts.some((part) => part.textAuthors.length > 0),
    parts.some((part) => part.textSources.length > 0),
  )
  const hasLanguages = parts.some((part) => part.languages.length > 0)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' })
  }, [focusId])

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{numberHeader}</TableCell>
            <TableCell>Werktitel</TableCell>
            <TableCell>Stimmen</TableCell>
            <TableCell>Quellen</TableCell>
            <TableCell>{authorOrSourceHeader}</TableCell>
            <TableCell>Ausgaben</TableCell>
            {hasLanguages && <TableCell>Sprache</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {parts.map((part) => (
            <TableRow
              key={part['@id']}
              selected={part['@id'] === focusId}
              ref={part['@id'] === focusId ? focusRef : undefined}
            >
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{part.number}</TableCell>
              <TableCell>{part.title}</TableCell>
              <TableCell>{part.voiceCounts.join(', ')}</TableCell>
              <TableCell>
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                  {Array.from(new Set(getWorkSources(part).map(({ source }) => source.siglum))).map((siglum) => (
                    <SourceChip key={siglum} siglum={siglum} maxWidth={160} />
                  ))}
                </Stack>
              </TableCell>
              <TableCell>
                <AuthorOrSourceText authors={textAuthorLabels(part)} sources={part.textSources} />
              </TableCell>
              <TableCell>
                <CitationChips item={part} />
              </TableCell>
              {hasLanguages && <TableCell>{part.languages.join(', ')}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// Die ausdruecklich gekennzeichneten Fassungen eines Werks
function VersionsTable({ versions }: { versions: Expression[] }) {
  const authorOrSourceHeader = authorOrSourceLabel(
    versions.some((version) => version.textAuthors.length > 0),
    versions.some((version) => version.textSources.length > 0),
  )
  const hasLanguages = versions.some((version) => version.languages.length > 0)
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{numberHeader}</TableCell>
            <TableCell>Titel</TableCell>
            <TableCell>Stimmen</TableCell>
            <TableCell>{authorOrSourceHeader}</TableCell>
            <TableCell>Ausgaben</TableCell>
            {hasLanguages && <TableCell>Sprache</TableCell>}
            <TableCell>Anmerkung</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version['@id']}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{version.number}</TableCell>
              <TableCell>{version.title}</TableCell>
              <TableCell>{version.voiceCounts.join(', ')}</TableCell>
              <TableCell>
                <AuthorOrSourceText authors={textAuthorLabels(version)} sources={version.textSources} />
              </TableCell>
              <TableCell>
                <CitationChips item={version} />
              </TableCell>
              {hasLanguages && <TableCell>{version.languages.join(', ')}</TableCell>}
              <TableCell>
                {version.notes.map((note) => `${note.label ? `${note.label}: ` : ''}${noteText(note)}`).join('; ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// Was nur fuer dieses Stueck in dieser Quelle gilt
function pieceSummary(item: WorkInSource): string {
  return [
    item.position !== null ? `Nr. ${item.position}${item.part ? `, Teil ${item.part}` : ''}` : item.part ? `Teil ${item.part}` : null,
    item.version ? `Fassung ${item.version.number}` : null,
    item.voices !== null ? `${item.voices} Stimmen` : null,
    item.titleInSource,
    item.dating,
    item.note,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Ein Druck eines Werks als Karte: Kopfzeile mit Sigle, RISM und den Angaben zum
// Stueck, aufgeklappt das Titelblatt. Ein Klick auf die Zeile fuehrt zur Quelle,
// aufgeklappt wird nur ueber den Pfeil.
function PrintCard({ item }: { item: WorkInSource }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const { source } = item
  return (
    <Accordion variant="outlined" disableGutters expanded={expanded}>
      <AccordionSummary
        component="div"
        onClick={() => navigate(sourcePath(source))}
        expandIcon={
          source.titlePage ? (
            <IconButton
              size="small"
              aria-label={expanded ? 'Titelblatt zuklappen' : 'Titelblatt aufklappen'}
              onClick={(event) => {
                event.stopPropagation()
                setExpanded(!expanded)
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          ) : undefined
        }
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <SourceChip siglum={source.siglum} earliest={item.isEarliestPrint} sx={{ flexShrink: 0 }} />
          <RismBadge source={source} />
          <Typography variant="body2">
            {source.description && <TextWithSourceLinks text={source.description} />}
            {source.description && pieceSummary(item) && ' · '}
            {pieceSummary(item)}
          </Typography>
        </Stack>
      </AccordionSummary>
      {source.titlePage && (
        <AccordionDetails>
          <SourceTitlePage title={source.titlePage} />
        </AccordionDetails>
      )}
    </Accordion>
  )
}

// Eine Handschrift als Karte: zuerst, wo sie liegt, aufgeklappt die Angaben zum
// Stueck und zur Quelle.
function ManuscriptCard({ item }: { item: WorkInSource }) {
  const { source } = item
  const physical = source.items[0]
  const summary = [physical?.place, physical?.library, physical?.shelfmark].filter(Boolean).join(', ') || source.title
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          {physical?.librarySiglum && (
            <SiglumChip
              siglum={physical.librarySiglum}
              link={physical.links[0] ?? null}
              maxWidth={96}
              sx={{ flexShrink: 0 }}
            />
          )}
          <Typography variant="body2">{summary}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Fact label="Ort" value={physical?.place ?? ''} />
          <Fact label="Bibliothek" value={physical?.library ?? ''} />
          <Fact label="Signatur" value={physical?.shelfmark ?? ''} />
          <Fact label="Frühere Signatur" value={physical?.formerShelfmark ?? ''} />
          <Fact label="Titel" value={item.titleInSource ?? ''} />
          <Fact label="Stimmen" value={item.voices ?? ''} />
          <Fact label="Datierung" value={item.dating ?? ''} />
          <Fact label="Bemerkung" value={item.note ?? ''} />
          <Fact label="Quellenart" value={source.sourceType ?? ''} />
          {source.notes
            .filter((note) => note.label !== 'Weitere Stücke')
            .map((note) => (
              <Fact key={note.html} label={note.label ?? 'Anmerkung'} value={noteText(note)} />
            ))}
          <Fact label="Literatur" value={source.literature.length > 0 ? <Linkified text={source.literature.join(' ')} /> : ''} />
          <Button component={RouterLink} to={sourcePath(source)} size="small" sx={{ alignSelf: 'flex-start' }}>
            Zur Quelle
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

function NotesList({ notes }: { notes: RawNote[] }) {
  return (
    <>
      {notes.map((note) => (
        <Fact key={note.html} label={note.label ?? 'Anmerkung'} labelWidth={130} value={noteText(note)} />
      ))}
    </>
  )
}

export function WorkDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const focusPart = (useLocation().state as { focusPart?: string } | null)?.focusPart
  const work = slug ? findWorkBySlug(slug) : undefined

  if (!work) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Werk nicht gefunden.</Alert>
        <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Zurück zur Übersicht
        </Button>
      </Container>
    )
  }

  const baseWork = findWholeWork(work)
  const relatedParts = findRelatedParts(work)
  const contents = getWorkSources(work)
  const prints = contents.filter(({ source }) => source.kind !== 'manuscript')
  const manuscripts = contents.filter(({ source }) => source.kind === 'manuscript')
  const earliestPrints = Array.from(
    new Set(prints.filter((item) => item.isEarliestPrint).map(({ source }) => source.siglum)),
  )
  const versions = getVersions(work)
  const expression = work.expression

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, sm: 3 }, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <BackButton overviewPath="/" />

      {baseWork && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Dies ist ein Teil von Werk{' '}
          <Chip
            label={formatCatalogNumber(baseWork.number)}
            size="small"
            clickable
            component={RouterLink}
            to={`/werk/${baseWork.slug}`}
            sx={{ verticalAlign: 'middle' }}
          />
          .
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Chip label={formatCatalogNumber(work.number)} size="small" sx={{ fontWeight: 700 }} />
          {!isBaseWork(work) && <Chip label="Teil" size="small" variant="outlined" />}
          {work.status && <Chip label={work.status} size="small" variant="outlined" />}
        </Stack>
        <Typography variant="h4" component="h2" sx={{ mb: 3 }}>
          {work.title}
        </Typography>

        {/* Breit in zwei Spalten, schmal untereinander. Leere Angaben fallen weg. */}
        <Box
          sx={{
            display: 'grid',
            columnGap: 4,
            rowGap: 1.5,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {work.variantTitles.length > 0 && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Fact label="Weitere Titel" labelWidth={130} value={work.variantTitles.join(' / ')} />
            </Box>
          )}
          <Fact label="Gattung" labelWidth={130} value={work.genres.join(', ')} />
          <Fact label="Sprache" labelWidth={130} value={work.languages.join(', ')} />
          <Fact label="Stimmen" labelWidth={130} value={work.voiceCounts.join(', ')} />
          <Fact
            label="Frühester Druck"
            labelWidth={130}
            value={
              earliestPrints.length > 0 ? (
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                  {earliestPrints.map((siglum) => (
                    <SourceChip key={siglum} siglum={siglum} earliest />
                  ))}
                </Stack>
              ) : (
                ''
              )
            }
          />
          <Fact label="Tonart" labelWidth={130} value={expression?.key ?? ''} />
          <Fact label="Metrum" labelWidth={130} value={expression?.meter ?? ''} />
          <Fact label="Tempo" labelWidth={130} value={expression?.tempo ?? ''} />
          <Fact label="Dauer" labelWidth={130} value={expression?.duration ?? ''} />
          <Fact label="Incipit" labelWidth={130} value={expression?.incipitText ?? ''} />
          <Fact label="Entstehung" labelWidth={130} value={expression?.dateCreated ?? ''} />
          <Fact label="Entstehungsort" labelWidth={130} value={expression?.placeCreated ?? ''} />
          <Fact
            label={authorOrSourceLabel(work.textAuthors.length > 0, work.textSources.length > 0)}
            labelWidth={130}
            value={<AuthorOrSourceText authors={textAuthorLabels(work)} sources={work.textSources} />}
          />
          <Fact
            label="Ausgaben"
            labelWidth={130}
            value={work.citations.length > 0 ? <CitationChips item={work} /> : ''}
          />
          <NotesList notes={work.notes} />
        </Box>

        <Box sx={{ mt: 3 }}>
          {relatedParts.length > 0 && (
            <Section
              title={baseWork ? 'Weitere Teile dieses Werks' : 'Teile dieses Werks'}
              count={relatedParts.length}
              defaultExpanded={relatedParts.some((part) => part['@id'] === focusPart)}
            >
              <Box sx={{ overflowX: 'auto' }}>
                <RelatedPartsTable parts={relatedParts} focusId={focusPart} />
              </Box>
            </Section>
          )}

          {prints.length > 0 && (
            <Section title="Drucke" count={prints.length}>
              <Stack spacing={1}>
                {prints.map((item, index) => (
                  <PrintCard key={`${item.source['@id']}|${index}`} item={item} />
                ))}
              </Stack>
            </Section>
          )}

          {manuscripts.length > 0 && (
            <Section title="Handschriften" count={manuscripts.length}>
              <Stack spacing={1}>
                {manuscripts.map((item, index) => (
                  <ManuscriptCard key={`${item.source['@id']}|${index}`} item={item} />
                ))}
              </Stack>
            </Section>
          )}

          {versions.length > 0 && (
            <Section title="Fassungen" count={versions.length}>
              <Box sx={{ overflowX: 'auto' }}>
                <VersionsTable versions={versions} />
              </Box>
            </Section>
          )}
        </Box>
      </Paper>
    </Container>
  )
}
