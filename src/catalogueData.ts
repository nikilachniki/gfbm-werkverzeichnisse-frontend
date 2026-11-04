import bibliographyFile from './data/bibliography.json'
import catalogFile from './data/catalog.json'
import expressionsFile from './data/expressions.json'
import institutionsFile from './data/institutions.json'
import instrumentationsFile from './data/instrumentations.json'
import itemsFile from './data/items.json'
import manifestationsFile from './data/manifestations.json'
import personsFile from './data/persons.json'
import placesFile from './data/places.json'
import worksFile from './data/works.json'
import type {
  Citation,
  Collection,
  Edition,
  Expression,
  LanguageText,
  Person,
  RawBibliography,
  RawCatalogue,
  RawContributor,
  RawExpression,
  RawIdentifier,
  RawInstitution,
  RawInstrumentation,
  RawItem,
  RawManifestation,
  RawNote,
  RawPerson,
  RawPlace,
  RawPublication,
  RawTitle,
  RawWork,
  Source,
  SourceKind,
  UnassignedPiece,
  Volume,
  VolumeContent,
  Work,
  WorkInSource,
} from './types'

// Die Daten sind zur Buildzeit eingebunden, siehe scripts/sync-data.mjs. Sie werden
// einmal beim Laden in die Anzeigemodelle ueberfuehrt; die Beziehungen stehen in
// den Daten nur in einer Richtung, die Gegenrichtung entsteht hier.

const rows = <T>(file: unknown) => (file as Collection<T>).entries

export const catalogue = catalogFile as unknown as RawCatalogue

const byId = <T extends { '@id': string }>(items: T[]) => new Map(items.map((item) => [item['@id'], item]))
const localId = (id: string) => id.slice(id.indexOf(':') + 1)

const rawExpressions = rows<RawExpression>(expressionsFile)
const rawInstrumentations = byId(rows<RawInstrumentation>(instrumentationsFile))
const rawPlaces = byId(rows<RawPlace>(placesFile))
const rawInstitutions = byId(rows<RawInstitution>(institutionsFile))
const rawManifestations = rows<RawManifestation>(manifestationsFile)
const rawItems = rows<RawItem>(itemsFile)
const rawPersons = byId(rows<RawPerson>(personsFile))
const rawBibliography = rows<RawBibliography>(bibliographyFile)
const rawWorks = rows<RawWork>(worksFile)

const LANGUAGE_NAMES: Record<string, string> = {
  'terms:Latin': 'Latein',
  'terms:Italian': 'Italienisch',
  'terms:French': 'Französisch',
  'terms:German': 'Deutsch',
  'terms:English': 'Englisch',
  'terms:Spanish': 'Spanisch',
}

const termLabel = (term: string) => term.replace(/^terms:/, '')
const languageName = (term: string) => LANGUAGE_NAMES[term] ?? termLabel(term)
const textOf = (text: LanguageText | undefined) => Object.values(text ?? {})[0] ?? ''
const placeName = (id: string | undefined) => (id ? (rawPlaces.get(id)?.name ?? null) : null)
const distinct = <T>(values: T[]) => Array.from(new Set(values))

// Anmerkungen duerfen HTML enthalten, angezeigt wird nur der Text.
export function noteText(note: RawNote): string {
  return new DOMParser().parseFromString(note.html, 'text/html').body.textContent ?? ''
}

function formatNumber(identifiers: RawIdentifier[] | undefined): string {
  const identifier =
    identifiers?.find((candidate) => candidate.list === catalogue.catalogueAbbreviation) ?? identifiers?.[0]
  if (!identifier) {
    return ''
  }
  return identifier.list === catalogue.catalogueAbbreviation ? identifier.value : `${identifier.list} ${identifier.value}`
}

function splitTitles(titles: RawTitle[] | undefined): { main: string; variants: string[] } {
  const main = titles?.find((title) => title.type === 'terms:MainTitle') ?? titles?.[0]
  return {
    main: textOf(main?.text),
    variants: (titles ?? []).filter((title) => title !== main).map((title) => textOf(title.text)),
  }
}

// Eine Person zeigt Vor- und Nachname. Normdaten erkennt die Anzeige an der Adresse.
const persons = new Map<string, Person>(
  Array.from(rawPersons.values()).map((person) => {
    const links = person.sameAs ?? []
    return [
      person['@id'],
      {
        '@id': person['@id'],
        preferredName: [person.givenName, person.familyName].filter(Boolean).join(' '),
        variantNames: person.alternateNames ?? [],
        gnd: links.find((link) => link.includes('d-nb.info')) ?? null,
        viaf: links.find((link) => link.includes('viaf.org')) ?? null,
      },
    ]
  }),
)

const lyricists = (contributors: RawContributor[] | undefined) =>
  (contributors ?? []).filter((contributor) => contributor.role === 'terms:Lyricist')

function instrumentationVoices(expression: RawExpression): number[] {
  const details = expression.instrumentation
    ? (rawInstrumentations.get(expression.instrumentation)?.details ?? [])
    : []
  return details.flatMap((detail) => (detail.quantity !== undefined ? [detail.quantity] : []))
}

function formatKey(key: RawExpression['key']): string {
  if (!key) {
    return ''
  }
  return (
    key.description ?? [key.pitch, key.accidental, key.mode].filter(Boolean).map((term) => termLabel(term ?? '')).join(' ')
  )
}

function formatMeter(meter: RawExpression['meter']): string {
  if (!meter) {
    return ''
  }
  if (meter.description || meter.meterSymbol) {
    return meter.description ?? meter.meterSymbol ?? ''
  }
  return meter.meterCount !== undefined ? `${meter.meterCount}/${meter.meterUnit ?? ''}` : ''
}

// Fuer Stimmen je Expression: Besetzung und die Angaben aus den Quellen
const contentVoices = new Map<string, number[]>()
for (const manifestation of rawManifestations) {
  for (const content of manifestation.contents ?? []) {
    if (content.embodies && content.voices !== undefined) {
      contentVoices.set(content.embodies, [...(contentVoices.get(content.embodies) ?? []), content.voices])
    }
  }
}

const expressions = new Map<string, Expression>(
  rawExpressions.map((raw) => {
    const authors = lyricists(raw.contributors)
    const titles = splitTitles(raw.titles)
    return [
      raw['@id'],
      {
        '@id': raw['@id'],
        number: formatNumber(raw.identifiers),
        title: raw.label,
        variantTitles: titles.variants.length > 0 || !titles.main ? titles.variants : [titles.main],
        voiceCounts: distinct([...instrumentationVoices(raw), ...(contentVoices.get(raw['@id']) ?? [])]).sort((a, b) => a - b),
        textAuthors: authors.map((author) => author.agent),
        uncertainTextAuthors: authors.filter((author) => author.certainty === 'terms:LowCertainty').map((author) => author.agent),
        textSources: raw.textSources ?? [],
        citations: raw.citations ?? [],
        languages: (raw.languages ?? []).map(languageName),
        key: formatKey(raw.key),
        meter: formatMeter(raw.meter),
        tempo: raw.tempo ?? '',
        duration: raw.duration ?? '',
        incipitText: textOf(raw.incipit?.incipitText),
        incipitCode: raw.incipit?.pae ?? '',
        dateCreated: raw.dateCreated?.description ?? raw.dateCreated?.date ?? '',
        placeCreated: placeName(raw.placeCreated) ?? '',
        notes: raw.notes ?? [],
      },
    ]
  }),
)

const partsOf = new Map<string, string[]>()
for (const work of rawWorks) {
  if (work.partOfWork) {
    partsOf.set(work.partOfWork, [...(partsOf.get(work.partOfWork) ?? []), work['@id']])
  }
}

export const compareNatural = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true })

export const works: Work[] = rawWorks
  .map((raw) => {
    const titles = splitTitles(raw.titles)
    const authors = lyricists(raw.contributors)
    const [mainId, ...versions] = raw.realisedIn ?? []
    const main = mainId ? (expressions.get(mainId) ?? null) : null
    return {
      '@id': raw['@id'],
      slug: localId(raw['@id']),
      number: formatNumber(raw.identifiers),
      title: titles.main,
      variantTitles: titles.variants,
      isPartOf: raw.partOfWork ?? null,
      hasPart: partsOf.get(raw['@id']) ?? [],
      voiceCounts: main?.voiceCounts ?? [],
      textAuthors: authors.map((author) => author.agent),
      uncertainTextAuthors: authors.filter((author) => author.certainty === 'terms:LowCertainty').map((author) => author.agent),
      textSources: raw.textSources ?? [],
      citations: raw.citations ?? [],
      genres: raw.genres ?? [],
      languages: main?.languages ?? [],
      versions,
      expression: main,
      status: raw.status ?? null,
      sameAs: raw.sameAs ?? [],
      notes: raw.notes ?? [],
    }
  })
  .sort((a, b) => compareNatural(a.number, b.number))

const workById = byId(works)
const workByExpressionId = new Map<string, Work>()
for (const raw of rawWorks) {
  const work = workById.get(raw['@id'])
  for (const id of raw.realisedIn ?? []) {
    if (work) {
      workByExpressionId.set(id, work)
    }
  }
}

function publicationYear(publication: RawPublication | undefined): number | null {
  const year = publication?.startDate?.slice(0, 4)
  return year ? Number(year) : null
}

function publicationLabel(publication: RawPublication | undefined): string {
  return publication?.label ?? (publicationYear(publication)?.toString() ?? '')
}

const noteByLabel = (notes: RawNote[], label: string) => notes.find((note) => note.label === label)

function sourceKind(raw: RawManifestation): SourceKind {
  const classifications = raw.classifications ?? []
  if (classifications.includes('terms:Print')) {
    return 'print'
  }
  return classifications.includes('terms:Manuscript') ? 'manuscript' : 'other'
}

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  print: 'Druck',
  manuscript: 'Handschrift',
  other: 'Sonstige',
}

const itemsBySource = new Map<string, RawItem[]>()
for (const item of rawItems) {
  itemsBySource.set(item.exemplifies, [...(itemsBySource.get(item.exemplifies) ?? []), item])
}

export const sources: Source[] = rawManifestations
  .map((raw) => {
    const identifiers = raw.identifiers ?? []
    const siglum = identifiers.find((identifier) => identifier.list === 'Sigle')?.value
    const title = textOf(raw.titles[0]?.text)
    const notes = raw.notes ?? []
    const links = raw.sameAs ?? []
    const description = noteByLabel(notes, 'Beschreibung')
    return {
      '@id': raw['@id'],
      slug: localId(raw['@id']),
      siglum: siglum ?? title,
      kind: sourceKind(raw),
      title,
      titlePage: raw.titlePages?.[0] ? noteText(raw.titlePages[0]) : null,
      year: publicationYear(raw.publication),
      dateLabel: publicationLabel(raw.publication),
      place: placeName(raw.publication?.place),
      publisher: raw.publication?.publisherName ?? null,
      description: description ? noteText(description) : null,
      sourceType: raw.sourceType ?? null,
      partbooks: raw.partbooks ?? null,
      literature: raw.literature ?? [],
      references: identifiers
        .filter((identifier) => identifier.list !== 'Sigle' && identifier.list !== 'RISM')
        .map((identifier) => ({ catalogue: identifier.list, value: identifier.value })),
      rismLabel: identifiers.find((identifier) => identifier.list === 'RISM')?.value ?? null,
      rismUrl: links.find((link) => link.includes('rism')) ?? null,
      links,
      items: (itemsBySource.get(raw['@id']) ?? []).map((item) => {
        const institution = item.keeper ? rawInstitutions.get(item.keeper) : undefined
        return {
          '@id': item['@id'],
          label: item.label,
          place: placeName(institution?.place),
          library: institution?.name ?? null,
          librarySiglum: institution?.siglum ?? null,
          shelfmark: item.shelfmark ?? null,
          formerShelfmark: item.formerShelfmark ?? null,
          links: item.sameAs ?? [],
          notes: item.notes ?? [],
        }
      }),
      notes: notes.filter((note) => note !== description),
    }
  })
  .sort((a, b) => compareNatural(a.siglum, b.siglum))

const sourceById = byId(sources)
const sourceBySlug = new Map(sources.map((source) => [source.slug, source]))
const sourceBySiglum = new Map(sources.map((source) => [source.siglum, source]))

// Stuecke je Quelle und je Werk
const contentsBySource = new Map<string, WorkInSource[]>()
const contentsByWork = new Map<string, WorkInSource[]>()
const unassignedBySource = new Map<string, UnassignedPiece[]>()
for (const raw of rawManifestations) {
  const source = sourceById.get(raw['@id'])
  for (const content of raw.contents ?? []) {
    if (source && !content.embodies) {
      unassignedBySource.set(source['@id'], [
        ...(unassignedBySource.get(source['@id']) ?? []),
        {
          title: content.titleInSource ?? '',
          position: content.position ?? null,
          part: content.part ?? null,
          voices: content.voices ?? null,
          dating: content.dating ?? null,
          note: content.note ?? null,
        },
      ])
      continue
    }
    const work = content.embodies ? workByExpressionId.get(content.embodies) : undefined
    if (!source || !work || !content.embodies) {
      continue
    }
    const item: WorkInSource = {
      work,
      version: content.embodies === work.expression?.['@id'] ? null : (expressions.get(content.embodies) ?? null),
      source,
      isEarliestPrint: false,
      position: content.position ?? null,
      part: content.part ?? null,
      titleInSource: content.titleInSource ?? null,
      voices: content.voices ?? null,
      dating: content.dating ?? null,
      note: content.note ?? null,
    }
    contentsBySource.set(source['@id'], [...(contentsBySource.get(source['@id']) ?? []), item])
    contentsByWork.set(work['@id'], [...(contentsByWork.get(work['@id']) ?? []), item])
  }
}

function comparePositions(a: WorkInSource, b: WorkInSource): number {
  if (a.position === null || b.position === null) {
    return a.position === b.position ? compareNatural(a.work.number, b.work.number) : a.position === null ? 1 : -1
  }
  return (
    compareNatural(a.position, b.position) ||
    compareNatural(a.part ?? '', b.part ?? '') ||
    compareNatural(a.work.number, b.work.number)
  )
}

for (const list of contentsBySource.values()) {
  list.sort(comparePositions)
}
for (const list of contentsByWork.values()) {
  list.sort((a, b) => compareNatural(a.source.siglum, b.source.siglum))
}

// Sigeln wie "1555-2" zaehlen die Drucke eines Jahres durch.
const YEAR_NUMBER_SIGLUM = /^\d{4}-\d+/

// Der frueheste Druck eines Werks ergibt sich aus dem Datum und braucht kein eigenes
// Feld. Innerhalb eines Jahres entscheidet die laufende Nummer der Sigle; fehlt sie,
// bleiben alle Drucke des Jahres markiert, statt einen zu raten. Siehe
// lassoDBData/docs/entscheidungen.md, Abschnitt 7.
function markEarliestPrints(list: WorkInSource[]): void {
  const dated = list.filter(({ source }) => source.kind === 'print' && source.year !== null)
  if (dated.length === 0) {
    return
  }
  const year = Math.min(...dated.map(({ source }) => source.year ?? Infinity))
  const candidates = dated.filter(({ source }) => source.year === year)
  const ordered = candidates.every(({ source }) => YEAR_NUMBER_SIGLUM.test(source.siglum))
  const first = ordered ? candidates.map(({ source }) => source.siglum).sort(compareNatural)[0] : null
  for (const item of candidates) {
    item.isEarliestPrint = first === null || item.source.siglum === first
  }
}

for (const list of contentsByWork.values()) {
  markEarliestPrints(list)
}

export function getSourceContents(source: Pick<Source, '@id'>): WorkInSource[] {
  return contentsBySource.get(source['@id']) ?? []
}

export function getUnassignedPieces(source: Pick<Source, '@id'>): UnassignedPiece[] {
  return unassignedBySource.get(source['@id']) ?? []
}

export function getWorkSources(work: Pick<Work, '@id'>): WorkInSource[] {
  return contentsByWork.get(work['@id']) ?? []
}

export const findSourceBySlug = (slug: string) => sourceBySlug.get(slug)
export const findSourceBySiglum = (siglum: string) => sourceBySiglum.get(siglum)
export const sourcePath = (source: Pick<Source, 'slug'>) => `/quelle/${encodeURIComponent(source.slug)}`

// Eine Quelle zur Anzeige: Titel mit Sigle, weil Nachdrucke denselben Titel tragen
export function sourceLabel(source: Pick<Source, 'siglum' | 'title'>): string {
  return source.title && source.title !== source.siglum ? `${source.title} (${source.siglum})` : source.siglum
}

// Personen

export const getPerson = (id: string) => persons.get(id)

export interface TextAuthorLabel {
  name: string
  person: Person | undefined
}

export function textAuthorLabels(item: Pick<Work, 'textAuthors' | 'uncertainTextAuthors'>): TextAuthorLabel[] {
  return item.textAuthors.map((id) => {
    const person = persons.get(id)
    const name = person?.preferredName ?? id
    return { name: item.uncertainTextAuthors.includes(id) ? `${name}?` : name, person }
  })
}

export function textAuthorSearchNames(id: string): string[] {
  const person = persons.get(id)
  return person ? [person.preferredName, ...person.variantNames] : [id]
}

// Werke

export const findWorkBySlug = (slug: string) => works.find((work) => work.slug === slug)
export const findWholeWork = (work: Pick<Work, 'isPartOf'>) => (work.isPartOf ? workById.get(work.isPartOf) : undefined)
export const isBaseWork = (work: Pick<Work, 'isPartOf'>) => work.isPartOf === null

export function getParts(work: Pick<Work, 'hasPart'>): Work[] {
  return work.hasPart.map((id) => workById.get(id)).filter((part): part is Work => part !== undefined)
}

export function findRelatedParts(work: Work): Work[] {
  const whole = findWholeWork(work) ?? work
  return [whole, ...getParts(whole)].filter((candidate) => candidate['@id'] !== work['@id'])
}

export function getVersions(work: Pick<Work, 'versions'>): Expression[] {
  return work.versions.map((id) => expressions.get(id)).filter((item): item is Expression => item !== undefined)
}

export function formatCatalogNumber(number: string): string {
  if (!number) {
    return 'Ohne Nummer'
  }
  return /^\p{L}/u.test(number) ? number : `${catalogue.catalogueAbbreviation} ${number}`
}

export const workLink = (work: Pick<Work, 'isPartOf' | 'slug' | '@id'>) =>
  work.isPartOf
    ? { to: `/werk/${localId(work.isPartOf)}`, state: { focusPart: work['@id'] } }
    : { to: `/werk/${work.slug}`, state: undefined }

// Ausgaben: Eine Reihe mit Baenden, ein Eintrag ohne Baende ist sein eigener Band.

const toVolume = (raw: RawBibliography): Volume => ({
  '@id': raw['@id'],
  slug: localId(raw['@id']),
  abbreviation: raw.abbreviation,
  title: textOf(raw.titles?.[0]?.text) || null,
  volumeNumber: raw.volumeNumber ?? null,
  editors: (raw.editors ?? []).map((id) => persons.get(id)?.preferredName ?? id),
  place: placeName(raw.publication?.place),
  publisher: raw.publication?.publisherName ?? null,
  dateLabel: publicationLabel(raw.publication),
})

const childrenOf = new Map<string, RawBibliography[]>()
for (const raw of rawBibliography) {
  if (raw.series) {
    childrenOf.set(raw.series, [...(childrenOf.get(raw.series) ?? []), raw])
  }
}

export const editions: Edition[] = rawBibliography
  .filter((raw) => !raw.series)
  .map((raw) => {
    const children = childrenOf.get(raw['@id']) ?? []
    return {
      '@id': raw['@id'],
      abbreviation: raw.abbreviation,
      title: textOf(raw.titles?.[0]?.text) || null,
      volumes: (children.length > 0 ? children : [raw])
        .map(toVolume)
        .sort((a, b) => compareNatural(a.abbreviation, b.abbreviation)),
    }
  })

const bibliographyById = byId(rawBibliography)

export function citationLocation(citation: Citation): string {
  if (citation.number !== undefined) {
    return `Nr. ${citation.number}`
  }
  return citation.page !== undefined ? `S. ${citation.page}` : ''
}

// Eine Fundstelle zur Anzeige, etwa "GA² XVI, Anhang 2, Nr. 3"
export function formatCitation(citation: Citation): string {
  const abbreviation = bibliographyById.get(citation.inBibliography)?.abbreviation ?? citation.inBibliography
  const label = [abbreviation, citation.section, citationLocation(citation)].filter(Boolean).join(', ')
  return citation.note ? `${label} ${citation.note}` : label
}

export function citationVolumeTitle(citation: Citation): string {
  const raw = bibliographyById.get(citation.inBibliography)
  return textOf(raw?.titles?.[0]?.text) || (raw?.abbreviation ?? citation.inBibliography)
}

export const volumePath = (bibliographyId: string) => `/ausgaben/${encodeURIComponent(localId(bibliographyId))}`

export const citationSearchText = (citation: Citation) =>
  [
    bibliographyById.get(citation.inBibliography)?.abbreviation,
    citation.section,
    citation.number ?? (citation.page !== undefined ? `S. ${citation.page}` : undefined),
    citation.note,
  ]
    .filter(Boolean)
    .join(' ')

const contentsByVolume = new Map<string, VolumeContent[]>()
{
  const add = (citation: Citation, content: Omit<VolumeContent, 'section' | 'location' | 'note'>) => {
    contentsByVolume.set(citation.inBibliography, [
      ...(contentsByVolume.get(citation.inBibliography) ?? []),
      { ...content, section: citation.section ?? null, location: citationLocation(citation), note: citation.note ?? null },
    ])
  }
  const sameCitation = (a: Citation, b: Citation) =>
    a.inBibliography === b.inBibliography && a.number === b.number && a.page === b.page && a.section === b.section
  for (const work of works) {
    const whole = findWholeWork(work)
    for (const citation of work.citations) {
      add(citation, {
        id: work['@id'],
        work,
        catalogNumber: formatCatalogNumber(work.number),
        title: work.title,
        isNestedPart: whole?.citations.some((other) => other.inBibliography === citation.inBibliography) ?? false,
      })
    }
    for (const version of getVersions(work)) {
      for (const citation of version.citations) {
        if (work.citations.some((other) => sameCitation(other, citation))) {
          continue
        }
        add(citation, {
          id: version['@id'],
          work,
          catalogNumber: formatCatalogNumber(version.number),
          title: version.title,
          isNestedPart: false,
        })
      }
    }
  }
  for (const list of contentsByVolume.values()) {
    list.sort(
      (a, b) =>
        compareNatural(a.section ?? '', b.section ?? '') ||
        compareNatural(a.location, b.location) ||
        compareNatural(a.catalogNumber, b.catalogNumber),
    )
  }
}

export const getVolumeContents = (volume: Pick<Volume, '@id'>) => contentsByVolume.get(volume['@id']) ?? []

// Die Zeile eines Werks oder einer Fassung im Band; eine Fassung, die dort nicht
// eigens steht, zeigt auf ihr Werk.
export function volumeContentId(volumeId: string, itemId: string): string {
  const contents = contentsByVolume.get(volumeId) ?? []
  if (contents.some((content) => content.id === itemId)) {
    return itemId
  }
  return workByExpressionId.get(itemId)?.['@id'] ?? itemId
}
