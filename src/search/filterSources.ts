import type { Source, SourceKind, WorkInSource } from '../types'
import { getParts, getSourceContents, getUnassignedPieces, sources } from '../catalogueData'
import { inYearRange, matchesNumber } from './filterFields'
import { indexDocument, parseQuery, scoreDocument, type SearchDocument } from './textSearch'

// Eine Quelle mit den zusammengefassten Angaben ihrer Stuecke, Grundlage fuer
// Tabelle und Filter der Uebersicht.
export interface SourceSummary {
  source: Source
  contents: WorkInSource[]
  voiceCounts: number[]
  textAuthors: string[]
  languages: string[]
}

const distinct = <T>(values: T[]) => Array.from(new Set(values))

export const sourceSummaries: SourceSummary[] = sources.map((source) => {
  const contents = getSourceContents(source)
  const works = contents.map(({ work }) => work)
  return {
    source,
    contents,
    voiceCounts: distinct(contents.flatMap(({ voices, work }) => (voices !== null ? [voices] : work.voiceCounts))).sort(
      (a, b) => a - b,
    ),
    textAuthors: distinct(works.flatMap((work) => work.textAuthors)),
    languages: distinct(works.flatMap((work) => work.languages)).sort((a, b) => a.localeCompare(b, 'de')),
  }
})

export interface SourcesFilters {
  query: string
  kinds: SourceKind[]
  siglum: string
  description: string
  sourceTitle: string
  references: string
  yearFrom: string
  yearTo: string
  number: string
  title: string
  textAuthors: string[]
  voiceCounts: number[]
  languages: string[]
}

export const defaultSourcesFilters: SourcesFilters = {
  query: '',
  kinds: [],
  siglum: '',
  description: '',
  sourceTitle: '',
  references: '',
  yearFrom: '',
  yearTo: '',
  number: '',
  title: '',
  textAuthors: [],
  voiceCounts: [],
  languages: [],
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('de-DE')

const documents = new Map<string, SearchDocument>()

function cachedDocument(key: string, build: () => SearchDocument): SearchDocument {
  let document = documents.get(key)
  if (!document) {
    document = build()
    documents.set(key, document)
  }
  return document
}

const titleFields = (source: Source) => [
  { text: source.title, numbers: true },
  { text: source.titlePage ?? '', numbers: true },
]

function fullDocument(summary: SourceSummary): SearchDocument {
  const { source } = summary
  return cachedDocument(`full|${source['@id']}`, () =>
    indexDocument([
      { text: source.siglum, weight: 3 },
      { text: source.title, weight: 3, numbers: true },
      { text: source.year?.toString() ?? '' },
      { text: source.rismLabel ?? '' },
      { text: source.description ?? '', weight: 2 },
      { text: source.titlePage ?? '', weight: 2, numbers: true },
      { text: source.partbooks ?? '' },
      { text: source.sourceType ?? '' },
      ...source.references.map((reference) => ({ text: `${reference.catalogue} ${reference.value}` })),
      ...source.items.flatMap((item) => [{ text: item.library ?? '' }, { text: item.place ?? '' }, { text: item.shelfmark ?? '' }]),
      ...getUnassignedPieces(source).map((piece) => ({ text: piece.title, numbers: true })),
      ...summary.languages.map((text) => ({ text })),
    ]),
  )
}

// Titel der enthaltenen Werke, auch in der Schreibung der Quelle
function worksTitleDocument(summary: SourceSummary): SearchDocument {
  return cachedDocument(`works|${summary.source['@id']}`, () =>
    indexDocument([
      ...summary.contents.flatMap(({ work, titleInSource }) =>
        [work.title, ...work.variantTitles, titleInSource ?? ''].map((text) => ({ text, numbers: true })),
      ),
      ...getUnassignedPieces(summary.source).map((piece) => ({ text: piece.title, numbers: true })),
    ]),
  )
}

const matches = (document: SearchDocument, query: ReturnType<typeof parseQuery>) =>
  !query || scoreDocument(document, query) > 0

// Die Listenfilter treffen eine Quelle, wenn mindestens eines ihrer Stuecke passt.
// Bei aktiver Volltextsuche nach Relevanz sortiert, sonst nach Sigle.
export function filterSources(summaries: SourceSummary[], filters: SourcesFilters): SourceSummary[] {
  const query = parseQuery(filters.query)
  const siglum = normalize(filters.siglum)
  const title = parseQuery(filters.title)
  const description = parseQuery(filters.description)
  const sourceTitle = parseQuery(filters.sourceTitle)
  const references = normalize(filters.references)
  const number = filters.number.trim()
  const scores = new Map<string, number>()
  const anyOf = <T>(selected: T[], values: T[]) =>
    selected.length === 0 || selected.some((value) => values.includes(value))

  const result = summaries.filter((summary) => {
    const { source } = summary
    if (filters.kinds.length > 0 && !filters.kinds.includes(source.kind)) {
      return false
    }
    if (siglum && !normalize(source.ownSiglum ?? '').includes(siglum)) {
      return false
    }
    if (!inYearRange(source.period, filters.yearFrom, filters.yearTo)) {
      return false
    }
    if (
      !matches(
        cachedDocument(`description|${source['@id']}`, () => indexDocument([{ text: source.description ?? '' }])),
        description,
      )
    ) {
      return false
    }
    if (!matches(cachedDocument(`title|${source['@id']}`, () => indexDocument(titleFields(source))), sourceTitle)) {
      return false
    }
    if (
      references &&
      ![...source.references, { catalogue: 'RISM', value: source.rismLabel ?? '' }].some((reference) =>
        normalize(`${reference.catalogue} ${reference.value}`).includes(references),
      )
    ) {
      return false
    }
    if (
      number &&
      !summary.contents.some(({ work }) => [work, ...getParts(work)].some((item) => matchesNumber(item.number, number)))
    ) {
      return false
    }
    if (!matches(worksTitleDocument(summary), title)) {
      return false
    }
    if (
      !anyOf(filters.textAuthors, summary.textAuthors) ||
      !anyOf(filters.voiceCounts, summary.voiceCounts) ||
      !anyOf(filters.languages, summary.languages)
    ) {
      return false
    }
    if (query) {
      const score = scoreDocument(fullDocument(summary), query)
      if (score === 0) {
        return false
      }
      scores.set(source['@id'], score)
    }
    return true
  })
  if (scores.size > 0) {
    result.sort((a, b) => (scores.get(b.source['@id']) ?? 0) - (scores.get(a.source['@id']) ?? 0))
  }
  return result
}
