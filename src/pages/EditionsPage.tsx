import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Section } from '../components/Section.tsx'
import { WorkTitle } from '../components/WorkTitle.tsx'
import type { Edition, Volume, VolumePart } from '../types.ts'
import {
  editions,
  getVolumeContents,
  volumeAncestorIds,
  volumeContentId,
  workSlug,
  type VolumeContent,
} from '../worksData.ts'

// Bleibt beim Wechsel zum Werk und zurueck erhalten: dieselben Baende sind offen,
// die Seite steht an derselben Stelle.
const view = {
  // Offene Ausgaben, Baende und Teilbaende
  expandedVolumes: new Set<string>(),
  scrollTop: 0,
  // Der Aufruf, dessen Band schon angesprungen wurde. Beim Zurueckkommen von
  // einem Werk gilt wieder die gemerkte Stelle statt erneut der Band.
  arrivedAt: null as string | null,
}

function volumeHeading(volume: Volume): string {
  const details = [volume.title, volume.year].filter((detail) => detail !== null)
  return details.length > 0 ? `Band ${volume.volume}: ${details.join(', ')}` : `Band ${volume.volume}`
}

// Die Werke, die ein Band ohne Teilbandangabe fuehrt, stehen bei einem Band mit
// Teilbaenden in einem eigenen Abschnitt neben diesen.
const withoutPartId = (volumeId: string) => `${volumeId}/ohne-teilband`

// Ohne eingerueckte Teile, die gehoeren zu ihrem Gesamtwerk.
function ownWorkCount(volume: Volume | VolumePart): number {
  return getVolumeContents(volume).filter((content) => !content.isNestedPart).length
}

function volumeWorkCount(volume: Volume): number {
  return volume.parts.reduce((sum, part) => sum + ownWorkCount(part), ownWorkCount(volume))
}

function editionWorkCount(edition: Edition): number {
  return edition.volumes.reduce((sum, volume) => sum + volumeWorkCount(volume), 0)
}

function VolumeContentRow({
  content,
  showLocation,
  focused,
}: {
  content: VolumeContent
  showLocation: boolean
  focused: boolean
}) {
  const { work } = content
  // Teile haben keine eigene Detailseite, siehe WorksPage.handleRowClick.
  const link = work.isPartOf
    ? { to: `/werk/${workSlug({ '@id': work.isPartOf })}`, state: { focusPart: work['@id'] } }
    : { to: `/werk/${workSlug(work)}` }
  return (
    <Box
      component={RouterLink}
      {...link}
      data-focus-row={focused || undefined}
      sx={{
        display: 'flex',
        columnGap: 2,
        py: 0.5,
        px: 1,
        color: 'text.primary',
        textDecoration: 'none',
        borderRadius: 1,
        bgcolor: focused ? 'action.selected' : undefined,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ width: 64, flexShrink: 0 }}>
        {showLocation && content.location}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>
        {content.catalogNumber}
      </Typography>
      <Typography variant="body2" sx={{ minWidth: 0, pl: content.isNestedPart ? 2 : 0 }}>
        <WorkTitle basis={content.titleBasis}>{content.title}</WorkTitle>
        {content.note && (
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {' '}
            {content.note}
          </Box>
        )}
      </Typography>
    </Box>
  )
}

// Die Werke eines Bandes in der Reihenfolge der Ausgabe. Teile teilen sich die
// Nummer ihres Gesamtwerks, die Nummer steht deshalb nur in der ersten Zeile.
function VolumeContents({
  contents,
  focusId,
  nested,
}: {
  contents: VolumeContent[]
  focusId?: string
  nested: boolean
}) {
  return (
    <>
      {contents.map((content, index) => {
        const previous = contents[index - 1]
        const startsAppendix = content.appendix !== null && content.appendix !== previous?.appendix
        const showLocation =
          startsAppendix || content.location !== previous?.location || content.appendix !== previous?.appendix
        return (
          <Box key={content.id}>
            {startsAppendix && (
              <Typography variant="subtitle2" component={nested ? 'h5' : 'h4'} sx={{ mt: 2, mb: 0.5, px: 1 }}>
                {content.appendix}
              </Typography>
            )}
            <VolumeContentRow content={content} showLocation={showLocation} focused={content.id === focusId} />
          </Box>
        )
      })}
    </>
  )
}

// Die bibliographischen Angaben eines Bandes. Noch nicht erfasste Angaben stehen
// als Platzhalter da, siehe entscheidungen.md, Abschnitt 43.
function VolumeDetails({ volume }: { volume: Volume }) {
  const fields = [
    ['Titel', volume.title],
    ['Hrsg.', volume.editors.join(', ')],
    ['Ort', volume.place],
    ['Verlag', volume.publisher],
    ['Jahr', volume.year],
  ] as const
  return (
    <Box component="dl" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5, m: 0, mb: 1.5, px: 1 }}>
      {fields.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', columnGap: 0.75 }}>
          <Typography variant="body2" component="dt" color="text.secondary">
            {label}:
          </Typography>
          <Typography variant="body2" component="dd" sx={{ m: 0 }}>
            {value || '–'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// Ein Abschnitt, der sich merkt, ob er offen ist. Der Zustand wird beim Einbau
// gelesen, weil Section defaultExpanded nur beim ersten Rendern liest und
// Teilbaende beim Zuklappen ihres Bandes ausgebaut werden.
function RememberedSection({
  id,
  title,
  count,
  level,
  children,
}: {
  id: string
  title: string
  count: number
  level: 2 | 3 | 4
  children: ReactNode
}) {
  const [defaultExpanded] = useState(() => view.expandedVolumes.has(id))
  return (
    <Section
      title={title}
      count={count}
      level={level}
      defaultExpanded={defaultExpanded}
      onExpandedChange={(expanded) => {
        if (expanded) {
          view.expandedVolumes.add(id)
        } else {
          view.expandedVolumes.delete(id)
        }
      }}
    >
      {children}
    </Section>
  )
}

// Das Ziel eines Aufrufs: der Band oder Teilband und das markierte Werk darin
interface Arrival {
  target: string | null
  focusId?: string
}

function VolumeSection({ volume, arrival }: { volume: Volume; arrival: Arrival }) {
  const isTarget = volume['@id'] === arrival.target
  const contents = getVolumeContents(volume)
  const focusId = isTarget ? arrival.focusId : undefined
  return (
    <Box data-focus-volume={isTarget || undefined}>
      <RememberedSection id={volume['@id']} title={volumeHeading(volume)} count={volumeWorkCount(volume)} level={3}>
        <VolumeDetails volume={volume} />
        {volume.parts.length === 0 ? (
          <VolumeContents contents={contents} focusId={focusId} nested={false} />
        ) : (
          <Box sx={{ pl: 2 }}>
            {contents.length > 0 && (
              <RememberedSection
                id={withoutPartId(volume['@id'])}
                title="Ohne Teilbandangabe"
                count={ownWorkCount(volume)}
                level={4}
              >
                <VolumeContents contents={contents} focusId={focusId} nested />
              </RememberedSection>
            )}
            {volume.parts.map((part) => (
              <Box key={part['@id']} data-focus-volume={part['@id'] === arrival.target || undefined}>
                <RememberedSection
                  id={part['@id']}
                  title={`Teilband ${part.volume.split(',')[1]}`}
                  count={ownWorkCount(part)}
                  level={4}
                >
                  <VolumeContents
                    contents={getVolumeContents(part)}
                    focusId={part['@id'] === arrival.target ? arrival.focusId : undefined}
                    nested
                  />
                </RememberedSection>
              </Box>
            ))}
          </Box>
        )}
      </RememberedSection>
    </Box>
  )
}

export function EditionsPage() {
  const scrollArea = useRef<HTMLDivElement>(null)
  const { volume: volumeSlug } = useParams<{ volume: string }>()
  const location = useLocation()

  // Einmal beim Aufruf festgelegt, weil ein Wechsel der Adresse die Seite nicht
  // neu aufbaut. Vor dem Rendern der Abschnitte, die view.expandedVolumes lesen.
  const [initial] = useState(() => {
    const target = volumeSlug && location.key !== view.arrivedAt ? `edition:${volumeSlug}` : null
    const focus = (location.state as { focus?: string } | null)?.focus
    if (target) {
      for (const id of [...volumeAncestorIds(target), target, withoutPartId(target)]) {
        view.expandedVolumes.add(id)
      }
    }
    return {
      arrivalKey: location.key,
      target,
      focusId: target && focus ? volumeContentId(target, focus) : undefined,
    }
  })

  useLayoutEffect(() => {
    const area = scrollArea.current
    if (!area) {
      return
    }
    if (!initial.target) {
      area.scrollTop = view.scrollTop
      return
    }
    view.arrivedAt = initial.arrivalKey
    const row = area.querySelector('[data-focus-row]')
    if (row) {
      row.scrollIntoView({ block: 'center' })
    } else {
      area.querySelector('[data-focus-volume]')?.scrollIntoView({ block: 'start' })
    }
  }, [initial])

  return (
    <Box
      ref={scrollArea}
      onScroll={(event) => {
        view.scrollTop = event.currentTarget.scrollTop
      }}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
        <Stack spacing={3}>
          {editions.map((edition) => (
            <Paper key={edition['@id']} variant="outlined" sx={{ px: { xs: 2, sm: 3 } }}>
              <RememberedSection
                id={edition['@id']}
                title={`${edition.siglum}: ${edition.title}`}
                count={editionWorkCount(edition)}
                level={2}
              >
                {edition.volumes.map((volume) => (
                  <VolumeSection key={volume['@id']} volume={volume} arrival={initial} />
                ))}
              </RememberedSection>
            </Paper>
          ))}
        </Stack>
      </Container>
    </Box>
  )
}
