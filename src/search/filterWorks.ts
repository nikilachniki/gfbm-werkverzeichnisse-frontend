import type { Work } from '../types'
import { citationSearchText, getVersions, getWorkSources, textAuthorSearchNames } from '../catalogueData'
import { inYearRange, matchesNumber } from './filterFields'
import { indexDocument, parseQuery, scoreDocument, type SearchDocument } from './textSearch'

export interface WorksFilters {
  query: string
  number: string
  title: string
  textAuthors: string[]
  textSources: string
  voiceCounts: number[]
  sources: string
  yearFrom: string
  yearTo: string
  editions: string
  languages: string[]
}

export const defaultWorksFilters: WorksFilters = {
  query: '',
  number: '',
  title: '',
  textAuthors: [],
  textSources: '',
  voiceCounts: [],
  sources: '',
  yearFrom: '',
  yearTo: '',
  editions: '',
  languages: [],
}

export function hasActiveFilters(filters: WorksFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.number.trim() !== '' ||
    filters.title.trim() !== '' ||
    filters.textAuthors.length > 0 ||
    filters.textSources.trim() !== '' ||
    filters.voiceCounts.length > 0 ||
    filters.sources.trim() !== '' ||
    filters.yearFrom !== '' ||
    filters.yearTo !== '' ||
    filters.editions.trim() !== '' ||
    filters.languages.length > 0
  )
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('de-DE')

// Fundstellen unabhaengig von Komma und Leerzeichen vergleichen. Fassungen gehoeren
// zum Werk, ihre Fundstellen zaehlen mit.
const normalizeCitation = (value: string) => normalize(value).replace(/[,\s]+/g, ' ')

function editionSearchTexts(work: Work): string[] {
  return [work, ...getVersions(work)].flatMap((item) => item.citations).map(citationSearchText)
}

function sourceSearchTexts(work: Work): string[] {
  return getWorkSources(work).flatMap(({ source }) => [
    source.siglum,
    ...source.items.flatMap((item) => [item.librarySiglum ?? '', item.library ?? '', item.shelfmark ?? '']),
  ])
}

// Suchindex je Werk, beim ersten Suchen aufgebaut. Titel zaehlen am meisten, die
// Titel in den Quellen mit. Fassungen gehoeren zum Werk.
const titleDocuments = new Map<string, SearchDocument>()
const fullDocuments = new Map<string, SearchDocument>()

function titleFields(work: Work) {
  return [
    { text: work.title, weight: 3, numbers: true },
    ...work.variantTitles.map((text) => ({ text, weight: 2, numbers: true })),
    ...getVersions(work).flatMap((version) =>
      [version.title, ...version.variantTitles].map((text) => ({ text, weight: 2, numbers: true })),
    ),
  ]
}

function titleDocument(work: Work): SearchDocument {
  let document = titleDocuments.get(work['@id'])
  if (!document) {
    document = indexDocument(titleFields(work))
    titleDocuments.set(work['@id'], document)
  }
  return document
}

function fullDocument(work: Work): SearchDocument {
  let document = fullDocuments.get(work['@id'])
  if (!document) {
    document = indexDocument([
      { text: work.number },
      ...titleFields(work),
      ...getWorkSources(work).map((content) => ({ text: content.titleInSource ?? '', weight: 1.5, numbers: true })),
      ...work.textAuthors.flatMap(textAuthorSearchNames).map((text) => ({ text, weight: 1.5 })),
      ...work.textSources.map((text) => ({ text })),
      ...sourceSearchTexts(work).map((text) => ({ text })),
      ...getWorkSources(work).map(({ source }) => ({ text: source.title, numbers: true })),
      ...editionSearchTexts(work).map((text) => ({ text })),
      ...work.languages.map((text) => ({ text })),
      ...work.genres.map((text) => ({ text })),
      ...getVersions(work).map((version) => ({ text: version.number })),
    ])
    fullDocuments.set(work['@id'], document)
  }
  return document
}

// Die passenden Werke und die Punktzahl der Volltextsuche je Werk (@id), nach der
// die Tabelle bei aktiver Suche sortiert. Ohne Suchbegriff ist sie leer.
export function searchWorks(works: Work[], filters: WorksFilters): { works: Work[]; scores: Map<string, number> } {
  const query = parseQuery(filters.query)
  const textSources = normalize(filters.textSources)
  const sources = normalize(filters.sources)
  const editions = normalizeCitation(filters.editions)
  const title = parseQuery(filters.title)
  const scores = new Map<string, number>()

  const result = works.filter((work) => {
    const number = filters.number.trim()
    if (number && ![work, ...getVersions(work)].some((item) => matchesNumber(item.number, number))) {
      return false
    }
    if (title && scoreDocument(titleDocument(work), title) === 0) {
      return false
    }
    if (filters.textAuthors.length > 0 && !filters.textAuthors.some((author) => work.textAuthors.includes(author))) {
      return false
    }
    if (textSources && !work.textSources.some((value) => normalize(value).includes(textSources))) {
      return false
    }
    if (filters.voiceCounts.length > 0 && !filters.voiceCounts.some((count) => work.voiceCounts.includes(count))) {
      return false
    }
    if (sources && !sourceSearchTexts(work).some((value) => normalize(value).includes(sources))) {
      return false
    }
    if (
      (filters.yearFrom || filters.yearTo) &&
      !getWorkSources(work).some(({ source }) => inYearRange(source.period, filters.yearFrom, filters.yearTo))
    ) {
      return false
    }
    if (editions && !editionSearchTexts(work).some((value) => normalizeCitation(value).includes(editions))) {
      return false
    }
    if (filters.languages.length > 0 && !filters.languages.some((language) => work.languages.includes(language))) {
      return false
    }
    if (query) {
      const score = scoreDocument(fullDocument(work), query)
      if (score === 0) {
        return false
      }
      scores.set(work['@id'], score)
    }
    return true
  })
  return { works: result, scores }
}

export function collectDistinct<T>(works: Work[], pick: (work: Work) => T[]): T[] {
  const values = new Set<T>()
  works.forEach((work) => pick(work).forEach((value) => values.add(value)))
  return Array.from(values)
}
