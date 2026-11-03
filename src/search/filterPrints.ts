import type { Print } from '../types'
import {
  getParts,
  getPrintContents,
  printReferences,
  printRism,
  printYear,
  prints,
  type WorkInPrint,
} from '../worksData'
import { inYearRange, matchesLv } from './filterFields'
import { indexDocument, parseQuery, scoreDocument, type SearchDocument } from './textSearch'

// Ein Druck mit den zusammengefassten Angaben seiner Werke, Grundlage fuer
// Tabelle und Filter der Druckuebersicht.
export interface PrintSummary {
  print: Print
  year: number | null
  contents: WorkInPrint[]
  voiceCounts: number[]
  textAuthors: string[]
  languages: string[]
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

// Einmal beim Laden aufgebaut, die Daten aendern sich zur Laufzeit nicht.
// Die Angaben kommen vom Werk, nicht vom Eintrag, weil Nachdrucke keine
// eigenen Eintraege haben.
export const printSummaries: PrintSummary[] = prints.map((print) => {
  const contents = getPrintContents(print)
  const works = contents.map(({ work }) => work)
  return {
    print,
    year: printYear(print.siglum),
    contents,
    voiceCounts: distinct(works.flatMap((work) => work.voiceCounts)).sort((a, b) => a - b),
    textAuthors: distinct(works.flatMap((work) => work.textAuthors)),
    languages: distinct(works.flatMap((work) => work.languages)).sort((a, b) => a.localeCompare(b, 'de')),
  }
})

export interface PrintsFilters {
  query: string
  siglum: string
  description: string
  printTitle: string
  references: string
  yearFrom: string
  yearTo: string
  lv: string
  title: string
  textAuthors: string[]
  voiceCounts: number[]
  languages: string[]
}

export const defaultPrintsFilters: PrintsFilters = {
  query: '',
  siglum: '',
  description: '',
  printTitle: '',
  references: '',
  yearFrom: '',
  yearTo: '',
  lv: '',
  title: '',
  textAuthors: [],
  voiceCounts: [],
  languages: [],
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('de-DE')

// Suchindizes je Druck, beim ersten Suchen aufgebaut. Die Zeilenwechsel der
// diplomatischen Titelblaetter ("|", "=|") gleicht fold aus, damit
// "primo libro" auch ueber einen Zeilenwechsel hinweg trifft.
const documents = new Map<string, SearchDocument>()

function cachedDocument(key: string, build: () => SearchDocument): SearchDocument {
  let document = documents.get(key)
  if (!document) {
    document = build()
    documents.set(key, document)
  }
  return document
}

function fullDocument(summary: PrintSummary): SearchDocument {
  return cachedDocument(`full|${summary.print.siglum}`, () =>
    indexDocument([
      { text: summary.print.siglum, weight: 3 },
      { text: summary.print.shortTitle ?? '', weight: 3, numbers: true },
      { text: String(summary.year ?? '') },
      { text: printRism(summary.print)?.label ?? '' },
      { text: summary.print.description ?? '', weight: 2 },
      { text: summary.print.title ?? '', weight: 2, numbers: true },
      { text: summary.print.partbooks ?? '' },
      ...printReferences(summary.print).map((reference) => ({ text: `${reference.catalogue ?? ''} ${reference.value}` })),
      ...summary.languages.map((text) => ({ text })),
    ]),
  )
}

// Titel der enthaltenen Werke, auch in der Schreibung des Drucks
function worksTitleDocument(summary: PrintSummary): SearchDocument {
  return cachedDocument(`works|${summary.print.siglum}`, () =>
    indexDocument(
      summary.contents.flatMap(({ work, entries }) =>
        [work.preferredTitle ?? '', ...work.variantTitles, ...entries.map((entry) => entry.title ?? '')].map((text) => ({
          text,
          numbers: true,
        })),
      ),
    ),
  )
}

const matches = (document: SearchDocument, query: ReturnType<typeof parseQuery>) =>
  !query || scoreDocument(document, query) > 0

// Die Listenfilter (Textdichter, Stimmen, Sprache) treffen einen
// Druck, wenn mindestens eines seiner Werke passt, wie bei den Werken. Bei
// aktiver Volltextsuche nach Relevanz sortiert, sonst in der Reihenfolge der
// Eingabe (nach Sigel).
export function filterPrints(summaries: PrintSummary[], filters: PrintsFilters): PrintSummary[] {
  const query = parseQuery(filters.query)
  const siglum = normalize(filters.siglum)
  const title = parseQuery(filters.title)
  const description = parseQuery(filters.description)
  const printTitle = parseQuery(filters.printTitle)
  const references = normalize(filters.references)
  const scores = new Map<string, number>()
  const anyOf = <T>(selected: T[], values: T[]) =>
    selected.length === 0 || selected.some((value) => values.includes(value))

  const result = summaries.filter((summary) => {
    if (siglum && !normalize(summary.print.siglum).includes(siglum)) {
      return false
    }
    if (!inYearRange(summary.year, filters.yearFrom, filters.yearTo)) {
      return false
    }
    if (
      !matches(
        cachedDocument(`description|${summary.print.siglum}`, () => indexDocument([{ text: summary.print.description ?? '' }])),
        description,
      )
    ) {
      return false
    }
    if (
      !matches(
        cachedDocument(`title|${summary.print.siglum}`, () => indexDocument([{ text: summary.print.title ?? '', numbers: true }])),
        printTitle,
      )
    ) {
      return false
    }
    if (
      references &&
      ![...printReferences(summary.print), { catalogue: 'RISM', value: printRism(summary.print)?.label ?? '' }].some(
        (reference) => normalize(`${reference.catalogue ?? ''} ${reference.value}`).includes(references),
      )
    ) {
      return false
    }
    // Das Register fuehrt Gesamtwerke; "100-2" soll den Druck trotzdem finden,
    // wenn LV 100 darin steht.
    if (
      filters.lv.trim() &&
      !summary.contents.some(({ work }) => [work, ...getParts(work)].some((item) => matchesLv(item, filters.lv)))
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
      scores.set(summary.print.siglum, score)
    }
    return true
  })
  if (scores.size > 0) {
    // sort ist stabil: gleich gute Treffer bleiben nach Sigel geordnet
    result.sort((a, b) => (scores.get(b.print.siglum) ?? 0) - (scores.get(a.print.siglum) ?? 0))
  }
  return result
}
