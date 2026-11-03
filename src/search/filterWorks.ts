import type { Work } from '../types'
import {
  findPrintBySiglum,
  getExpressions,
  getManuscripts,
  printYear,
  textAuthorSearchNames,
  workPrintSigla,
} from '../worksData'
import { inYearRange, matchesLv } from './filterFields'
import { indexDocument, parseQuery, scoreDocument, type SearchDocument } from './textSearch'

export interface WorksFilters {
  query: string
  lv: string
  title: string
  textAuthors: string[]
  textSources: string
  voiceCounts: number[]
  prints: string
  yearFrom: string
  yearTo: string
  completeEditions: string
  languages: string[]
  manuscripts: string
}

export const defaultWorksFilters: WorksFilters = {
  query: '',
  lv: '',
  title: '',
  textAuthors: [],
  textSources: '',
  voiceCounts: [],
  prints: '',
  yearFrom: '',
  yearTo: '',
  completeEditions: '',
  languages: [],
  manuscripts: '',
}

export function hasActiveFilters(filters: WorksFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.lv.trim() !== '' ||
    filters.title.trim() !== '' ||
    filters.textAuthors.length > 0 ||
    filters.textSources.trim() !== '' ||
    filters.voiceCounts.length > 0 ||
    filters.prints.trim() !== '' ||
    filters.yearFrom !== '' ||
    filters.yearTo !== '' ||
    filters.completeEditions.trim() !== '' ||
    filters.languages.length > 0 ||
    filters.manuscripts.trim() !== ''
  )
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('de-DE')

// Suchindex je Werk, beim ersten Suchen aufgebaut; die Daten aendern sich zur
// Laufzeit nicht. Titel zaehlen am meisten, die Titel der Handschriften
// mit, weil nur sie oft die Zaehlung tragen ("1. Psalmus poenitentialis").
// Fassungen gehoeren zum Werk: wer nach ihrer LV-Nummer oder ihrem Titel
// sucht, soll das Werk finden. Ihre Drucke stehen schon in workPrintSigla.
const titleDocuments = new Map<string, SearchDocument>()
const fullDocuments = new Map<string, SearchDocument>()

function titleFields(work: Work) {
  const expressions = getExpressions(work)
  return [
    { text: work.preferredTitle ?? '', weight: 3, numbers: true },
    ...work.variantTitles.map((text) => ({ text, weight: 2, numbers: true })),
    ...expressions.flatMap((expression) =>
      [expression.preferredTitle ?? '', ...expression.variantTitles].map((text) => ({ text, weight: 2, numbers: true })),
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
      { text: work.lv ?? '' },
      { text: work.lvAnh !== null ? `Anh. ${work.lvAnh}` : '' },
      ...titleFields(work),
      ...getManuscripts(work).map((manuscript) => ({ text: manuscript.title ?? '', weight: 1.5, numbers: true })),
      ...work.textAuthors.flatMap(textAuthorSearchNames).map((text) => ({ text, weight: 1.5 })),
      ...work.textSources.map((text) => ({ text })),
      ...workPrintSigla(work).flatMap((siglum) => [
        { text: siglum },
        { text: findPrintBySiglum(siglum)?.shortTitle ?? '', numbers: true },
      ]),
      ...work.completeEditions.map((text) => ({ text })),
      ...work.languages.map((text) => ({ text })),
      ...getExpressions(work).map((expression) => ({ text: expression.lv ?? '' })),
    ])
    fullDocuments.set(work['@id'], document)
  }
  return document
}

// Die passenden Werke und die Punktzahl der Volltextsuche je Werk (@id), nach
// der die Tabelle bei aktiver Suche sortiert. Ohne Suchbegriff ist sie leer.
export function searchWorks(works: Work[], filters: WorksFilters): { works: Work[]; scores: Map<string, number> } {
  const query = parseQuery(filters.query)
  const textSources = normalize(filters.textSources)
  const prints = normalize(filters.prints)
  const completeEditions = normalize(filters.completeEditions)
  const title = parseQuery(filters.title)
  const manuscripts = normalize(filters.manuscripts)
  const scores = new Map<string, number>()

  const result = works.filter((work) => {
    // Fassungen gehoeren zum Werk, ihre Nummern, Titel und Drucke zaehlen mit.
    const expressions = getExpressions(work)
    // Alle Drucke, auch Nachdrucke und die Erstdrucke der Fassungen
    const printSigla = workPrintSigla(work)
    if (filters.lv.trim() && ![work, ...expressions].some((item) => matchesLv(item, filters.lv))) {
      return false
    }
    if (title && scoreDocument(titleDocument(work), title) === 0) {
      return false
    }
    if (
      filters.textAuthors.length > 0 &&
      !filters.textAuthors.some((author) => work.textAuthors.includes(author))
    ) {
      return false
    }
    if (textSources && !work.textSources.some((value) => normalize(value).includes(textSources))) {
      return false
    }
    if (
      filters.voiceCounts.length > 0 &&
      !filters.voiceCounts.some((count) => work.voiceCounts.includes(count))
    ) {
      return false
    }
    if (prints && !printSigla.some((value) => normalize(value).includes(prints))) {
      return false
    }
    if (
      (filters.yearFrom || filters.yearTo) &&
      !printSigla.some((siglum) =>
        inYearRange(printYear(siglum), filters.yearFrom, filters.yearTo),
      )
    ) {
      return false
    }
    if (
      manuscripts &&
      !getManuscripts(work).some((manuscript) => normalize(manuscript.rismSiglum ?? '').includes(manuscripts))
    ) {
      return false
    }
    if (
      completeEditions &&
      !work.completeEditions.some((value) => normalize(value).includes(completeEditions))
    ) {
      return false
    }
    if (
      filters.languages.length > 0 &&
      !filters.languages.some((language) => work.languages.includes(language))
    ) {
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
