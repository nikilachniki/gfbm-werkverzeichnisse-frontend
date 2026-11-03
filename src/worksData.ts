import editionsFile from './data/editions.json'
import entriesFile from './data/entries.json'
import expressionsFile from './data/expressions.json'
import manuscriptsFile from './data/manuscripts.json'
import personsFile from './data/persons.json'
import printsFile from './data/prints.json'
import worksFile from './data/works.json'
import type {
  CatalogueEntry,
  EditionAppearance,
  EditionsFile,
  EntriesFile,
  Expression,
  ExpressionsFile,
  ManuscriptsFile,
  ManuscriptWitness,
  Person,
  PersonsFile,
  Print,
  PrintsFile,
  TitleBasis,
  Volume,
  Work,
  WorksFile,
} from './types'

// Die JSON-Importe sind zur Buildzeit eingebunden, siehe scripts/sync-data.mjs.
// Es gibt keinen Server und keine Laufzeitabfrage, der gesamte Bestand wird clientseitig durchsucht und gefiltert.
export const works = (worksFile as WorksFile).items
const entries = (entriesFile as EntriesFile).items
const manuscripts = (manuscriptsFile as ManuscriptsFile).items
const persons = (personsFile as PersonsFile).items
const expressions = (expressionsFile as ExpressionsFile).items
export const prints = (printsFile as PrintsFile).items
export const editions = (editionsFile as EditionsFile).items

// Ein Werk verweist per @id-Liste auf seine Eintraege (je ein Eintrag pro
// Druck, in dem es erschienen ist) und auf seine Handschriften-Zeugnisse.
// Einmal als Map aufgebaut, statt bei jeder Detailseite erneut linear durch
// alle Eintraege bzw. Zeugnisse zu suchen.
const entryById = new Map(entries.map((entry) => [entry['@id'], entry]))
const manuscriptById = new Map(manuscripts.map((manuscript) => [manuscript['@id'], manuscript]))
const expressionById = new Map(expressions.map((expression) => [expression['@id'], expression]))
const workById = new Map(works.map((work) => [work['@id'], work]))
const personById = new Map(persons.map((person) => [person['@id'], person]))
const printBySiglum = new Map(prints.map((print) => [print.siglum, print]))

// Rueckverweis Eintrag -> Werk fuer die Druck-Detailseite. Eintraege einer
// Fassung stehen nicht in work.entries, sondern in der Fassung; sie gehoeren
// zum Werk, dessen Fassung sie sind.
const workByEntryId = new Map<string, Work>()
for (const work of works) {
  work.entries.forEach((id) => workByEntryId.set(id, work))
}
for (const expression of expressions) {
  const work = workById.get(expression.realizationOf)
  if (work) {
    expression.entries.forEach((id) => workByEntryId.set(id, work))
  }
}

// Sigel chronologisch vergleichen: "1555-2" vor "1555-10", Baende in Folge
export function comparePrintSigla(a: string, b: string): number {
  return a.localeCompare(b, 'de', { numeric: true })
}

// Ein Werk in einem Druck. piece und note stammen aus dem Gesamtregister
// (printAppearances), entries sind die Eintraege des LV-Katalogs, fuer die
// dieser Druck der Erstdruck ist. Ein Druck kann beides liefern oder nur eins
// davon: Nachdrucke haben keine Eintraege, und das Register fuehrt Teile
// nicht eigens, sondern unter der Grundnummer.
export interface WorkInPrint {
  work: Work
  siglum: string
  print: Print | undefined
  piece: string | null
  note: string | null
  entries: CatalogueEntry[]
}

// Fuer jeden Druck die enthaltenen Werke, einmal beim Laden aufgebaut. Ein
// Eintrag eines Teils haengt am Gesamtwerk, wenn dieses laut Register im
// Druck steht, sonst bildet er mit seinem Teil eine eigene Zeile.
const contentsBySiglum = new Map<string, WorkInPrint[]>()
{
  const byKey = new Map<string, WorkInPrint>()
  const add = (work: Work, siglum: string, piece: string | null, note: string | null) => {
    const key = `${work['@id']}|${siglum}`
    let content = byKey.get(key)
    if (!content) {
      content = { work, siglum, print: printBySiglum.get(siglum), piece, note, entries: [] }
      byKey.set(key, content)
      contentsBySiglum.set(siglum, [...(contentsBySiglum.get(siglum) ?? []), content])
    }
    return content
  }
  for (const work of works) {
    for (const appearance of work.printAppearances) {
      add(work, appearance.inPrint.replace(/^print:/, ''), appearance.piece, appearance.note ?? null)
    }
  }
  for (const entry of entries) {
    const owner = workByEntryId.get(entry['@id'])
    if (!entry.firstPrint || !owner) {
      continue
    }
    const whole = owner.isPartOf ? workById.get(owner.isPartOf) : undefined
    const target = (whole && byKey.get(`${whole['@id']}|${entry.firstPrint}`)) ?? add(owner, entry.firstPrint, null, null)
    target.entries.push(entry)
  }
}

// Ein Werk oder eine Fassung in einem Band der Gesamtausgabe
export interface VolumeContent {
  id: string
  // Das Werk, zu dem der Klick fuehrt
  work: Work
  catalogNumber: string
  title: string | null
  titleBasis: TitleBasis
  // "Nr. 12" oder "S. 3"
  location: string
  appendix: string | null
  note: string | null
  // Teil eines Gesamtwerks, das im selben Band steht
  isNestedPart: boolean
}

// Baende und Teilbaende, beide koennen Ziel einer Fundstelle sein. band ist bei
// einem Band er selbst.
const volumeById = new Map(
  editions.flatMap((edition) =>
    edition.volumes.flatMap((band) =>
      [band, ...band.parts].map((volume) => [volume['@id'], { edition, band, volume }] as const),
    ),
  ),
)

const appearanceLocation = (appearance: EditionAppearance) =>
  appearance.number !== undefined ? `Nr. ${appearance.number}` : `S. ${appearance.page}`

const sameLocation = (a: EditionAppearance, b: EditionAppearance) =>
  a.inVolume === b.inVolume && a.number === b.number && a.page === b.page && a.appendix === b.appendix

// Hauptteil vor Anhang, dann nach Stueck oder Seite; das Gesamtwerk steht durch
// die LV-Nummer vor seinen Teilen.
function compareVolumeContents(a: VolumeContent, b: VolumeContent): number {
  return (
    (a.appendix ?? '').localeCompare(b.appendix ?? '', 'de', { numeric: true }) ||
    a.location.localeCompare(b.location, 'de', { numeric: true }) ||
    a.catalogNumber.localeCompare(b.catalogNumber, 'de', { numeric: true })
  )
}

// Fuer jeden Band die enthaltenen Werke, einmal beim Laden aufgebaut. Eine
// Fassung erscheint nur, wenn ihr Werk nicht an derselben Stelle steht, sonst
// stuende dasselbe Stueck zweimal in der Liste.
const contentsByVolume = new Map<string, VolumeContent[]>()
{
  const add = (appearance: EditionAppearance, content: Omit<VolumeContent, 'location' | 'appendix' | 'note'>) => {
    const list = contentsByVolume.get(appearance.inVolume) ?? []
    list.push({
      ...content,
      location: appearanceLocation(appearance),
      appendix: appearance.appendix ?? null,
      note: appearance.note ?? null,
    })
    contentsByVolume.set(appearance.inVolume, list)
  }
  for (const work of works) {
    const whole = work.isPartOf ? workById.get(work.isPartOf) : undefined
    for (const appearance of work.editionAppearances) {
      add(appearance, {
        id: work['@id'],
        work,
        catalogNumber: formatCatalogNumber(work),
        title: work.preferredTitle,
        titleBasis: work.preferredTitleBasis,
        isNestedPart: whole?.editionAppearances.some((other) => other.inVolume === appearance.inVolume) ?? false,
      })
    }
  }
  for (const expression of expressions) {
    const work = workById.get(expression.realizationOf)
    if (!work) {
      continue
    }
    for (const appearance of expression.editionAppearances) {
      if (work.editionAppearances.some((other) => sameLocation(other, appearance))) {
        continue
      }
      add(appearance, {
        id: expression['@id'],
        work,
        catalogNumber: `LV ${expression.lv}`,
        title: expression.preferredTitle,
        titleBasis: expression.preferredTitleBasis,
        isNestedPart: false,
      })
    }
  }
  for (const list of contentsByVolume.values()) {
    list.sort(compareVolumeContents)
  }
}

export function getVolumeContents(volume: Pick<Volume, '@id'>): VolumeContent[] {
  return contentsByVolume.get(volume['@id']) ?? []
}

// Die Ebenen ueber einem Band oder Teilband: Ausgabe und Band
export function volumeAncestorIds(volumeId: string): string[] {
  const place = volumeById.get(volumeId)
  return place ? [place.edition['@id'], place.band['@id']] : []
}

// Adresse eines Bandes: die Seite klappt ihn auf und scrollt dorthin.
export function volumePath(volumeId: string): string {
  return `/gesamtausgabe/${volumeId.replace(/^edition:/, '')}`
}

// Die Zeile eines Werks oder einer Fassung im Band. Eine Fassung, die dort
// nicht eigens steht (siehe contentsByVolume), zeigt auf ihr Werk.
export function volumeContentId(volumeId: string, itemId: string): string {
  const contents = contentsByVolume.get(volumeId) ?? []
  if (contents.some((content) => content.id === itemId)) {
    return itemId
  }
  return expressionById.get(itemId)?.realizationOf ?? itemId
}

// Eine Fundstelle zur Anzeige, etwa "GA² XVI, Anhang 2, Nr. 3"
export function formatEditionAppearance(appearance: EditionAppearance): string {
  const place = volumeById.get(appearance.inVolume)
  const volume = place ? `${place.edition.siglum} ${place.volume.volume}` : appearance.inVolume
  const label = [volume, appearance.appendix, appearanceLocation(appearance)].filter(Boolean).join(', ')
  return appearance.note ? `${label} ${appearance.note}` : label
}

// Der Band einer Fundstelle ausgeschrieben, fuer den Tooltip
export function editionAppearanceVolumeTitle(appearance: EditionAppearance): string {
  const place = volumeById.get(appearance.inVolume)
  return place ? `${place.edition.title}, Band ${place.volume.volume}` : appearance.inVolume
}

// Die Fundstelle fuer die Suche, in der ueblichen Zitierweise ("GA XIX 476")
// und den Schreibweisen des Registers ("GA 2 XIV,I 65", "NR2 1"). Ohne "Nr.",
// weil die Suche "NR" sonst bei jedem Band mit Stuecknummern traefe.
export function editionAppearanceSearchTexts(appearance: EditionAppearance): string[] {
  const place = volumeById.get(appearance.inVolume)
  const citation = [
    place ? `${place.edition.siglum} ${place.volume.volume}` : appearance.inVolume,
    appearance.appendix,
    appearance.number ?? `S. ${appearance.page}`,
    appearance.note,
  ]
    .filter(Boolean)
    .join(' ')
  return Array.from(
    new Set([
      citation,
      citation.replace('GA²', 'GA 2'),
      citation.replace('GA²', 'GA2'),
      citation.replace('NR 1²', 'NR 1'),
      citation.replace('NR 1²', 'NR2 1'),
    ]),
  )
}

export function getPerson(id: string): Person | undefined {
  return personById.get(id)
}

// Ein anzuzeigender Textdichter: der Name, wie er erscheinen soll, und die
// Person dahinter fuer GND/VIAF-Badges und Schreibvarianten.
export interface TextAuthorLabel {
  name: string
  person: Person | undefined
}

// Textdichter eines Werks oder einer Fassung in der festgelegten Schreibweise.
// Eine unsichere Zuschreibung bekommt ein Fragezeichen, siehe
// Work.uncertainTextAuthors; der Personenname selbst traegt keins.
export function textAuthorLabels(
  item: Pick<Work, 'textAuthors' | 'uncertainTextAuthors'>,
): TextAuthorLabel[] {
  return item.textAuthors.map((id) => {
    const person = personById.get(id)
    const name = person?.preferredName ?? id
    const uncertain = item.uncertainTextAuthors.includes(id)
    return { name: uncertain ? `${name}?` : name, person }
  })
}

// Alle Namen eines Textdichters
export function textAuthorSearchNames(id: string): string[] {
  const person = personById.get(id)
  return person ? [person.preferredName, ...person.variantNames] : [id]
}

// Ein Werk hat entweder eine LV-Nummer aus dem Haupt-Katalog oder eine
// Nummer aus dem LV-Anhang (fuer Stuecke, die nur handschriftlich ueberliefert
// sind)
export function formatCatalogNumber(work: Pick<Work, 'lv' | 'lvAnh'>): string {
  if (work.lv !== null) {
    return `LV ${work.lv}`
  }
  if (work.lvAnh !== null) {
    return `Anh. ${work.lvAnh}`
  }
  return 'Ohne Katalognummer'
}

export function isBaseWork(work: Pick<Work, 'isPartOf'>): boolean {
  return work.isPartOf === null
}

// Der bevorzugte Titel (preferredTitle) ist der normalisierte Werktitel,
export function mainTitle(item: { preferredTitle: string | null }): string {
  return item.preferredTitle ?? ''
}

export function workSlug(work: Pick<Work, '@id'>): string {
  return work['@id'].replace(/^work:/, '')
}

export function findWorkBySlug(slug: string): Work | undefined {
  return workById.get(`work:${slug}`)
}

export function findWorkByExpressionSlug(slug: string): Work | undefined {
  const expression = expressionById.get(`expression:${slug}`)
  return expression ? workById.get(expression.realizationOf) : undefined
}


export function findWholeWork(work: Pick<Work, 'isPartOf'>): Work | undefined {
  return work.isPartOf ? workById.get(work.isPartOf) : undefined
}

// Die Teile eines Gesamtwerks in Katalogreihenfolge.
export function getParts(work: Pick<Work, 'hasPart'>): Work[] {
  return work.hasPart.map((id) => workById.get(id)).filter((part): part is Work => part !== undefined)
}

// Die uebrigen Werke derselben Gruppe: fuer ein Gesamtwerk seine Teile, fuer
// einen Teil das Gesamtwerk und die anderen Teile.
export function findRelatedParts(work: Work): Work[] {
  const whole = findWholeWork(work) ?? work
  return [whole, ...getParts(whole)].filter((candidate) => candidate['@id'] !== work['@id'])
}

// Die Eintraege eines Werks, chronologisch nach Erstdruck sortiert
export function getSortedEntries(work: Work): CatalogueEntry[] {
  const resolved = work.entries
    .map((id) => entryById.get(id))
    .filter((entry): entry is CatalogueEntry => entry !== undefined)

  return resolved.sort((a, b) => {
    const yearA = a.firstPrintYear ?? Infinity
    const yearB = b.firstPrintYear ?? Infinity
    if (yearA !== yearB) {
      return yearA - yearB
    }
    return (a.firstPrintNo ?? Infinity) - (b.firstPrintNo ?? Infinity)
  })
}

// Die Fassungen eines Werks, in der Reihenfolge der Teile, die sie betreffen
export function getExpressions(work: Work): Expression[] {
  return work.expressions
    .map((id) => expressionById.get(id))
    .filter((expression): expression is Expression => expression !== undefined)
}

// Die Handschriften eines Werks, sortiert nach Ort und Bibliothek,
// damit Handschriften aus derselben Stadt/Sammlung in der Tabelle zusammenstehen.
export function getManuscripts(work: Work): ManuscriptWitness[] {
  const resolved = work.manuscripts
    .map((id) => manuscriptById.get(id))
    .filter((manuscript): manuscript is ManuscriptWitness => manuscript !== undefined)

  return resolved.sort(
    (a, b) =>
      (a.place ?? '').localeCompare(b.place ?? '') ||
      (a.library ?? '').localeCompare(b.library ?? '') ||
      (a.shelfmark ?? '').localeCompare(b.shelfmark ?? ''),
  )
}

// Sigel wie "1575-3/I" enthalten einen Schraegstrich und werden deshalb fuer
// die Adresse kodiert.
export function printPath(siglum: string): string {
  return `/druck/${encodeURIComponent(siglum)}`
}

export function findPrintBySiglum(siglum: string): Print | undefined {
  return printBySiglum.get(siglum)
}

// Anzeigename eines Drucks: Kurztitel mit Sigel in Klammern, weil Nachdrucke
// denselben Kurztitel tragen ("Il primo libro di madrigali a cinque voci
// (1557-1)"). Ohne Kurztitel bleibt das Sigel.
export function printLabel(print: Pick<Print, 'siglum' | 'shortTitle'>): string {
  return print.shortTitle ? `${print.shortTitle} (${print.siglum})` : print.siglum
}

// Erscheinungsjahr eines Drucks. Bei Sigeln ohne Jahresangabe in prints.json
// (etwa "1575-3/I") steht das Jahr vorn im Sigel.
export function printYear(siglum: string): number | null {
  const year = printBySiglum.get(siglum)?.year
  if (year != null) {
    return year
  }
  const match = siglum.match(/^(\d{4})/)
  return match ? Number(match[1]) : null
}

// Jahr eines Drucks zur Anzeige, mit "ca." bei unsicherer Datierung
export function formatPrintYear(print: Print): string {
  const year = printYear(print.siglum)
  if (year === null) {
    return ''
  }
  return print.dateApproximate ? `ca. ${year}` : String(year)
}

// Stuecknummern wie "12", "III/1" oder "12 und 13" numerisch vergleichen,
// Werke ohne Stuecknummer ans Ende, dort nach LV.
function compareWorksInPrint(a: WorkInPrint, b: WorkInPrint): number {
  if (a.piece !== b.piece) {
    if (a.piece === null) {
      return 1
    }
    if (b.piece === null) {
      return -1
    }
    const byPiece = a.piece.localeCompare(b.piece, 'de', { numeric: true })
    if (byPiece !== 0) {
      return byPiece
    }
  }
  return (a.work.lv ?? '').localeCompare(b.work.lv ?? '', 'de', { numeric: true })
}

// Die Werke eines Drucks in der Reihenfolge der Stuecke
export function getPrintContents(print: Print): WorkInPrint[] {
  return [...(contentsBySiglum.get(print.siglum) ?? [])].sort(compareWorksInPrint)
}

// Alle Drucke eines Werks, chronologisch: die Nachweise des Registers und die
// Erstdrucke seiner Eintraege und Fassungen. Anders als auf der Druckseite
// zaehlen hier nur die eigenen Eintraege, nicht die der Teile.
export function getWorkPrints(work: Work): WorkInPrint[] {
  const bySiglum = new Map<string, WorkInPrint>()
  const add = (siglum: string, piece: string | null, note: string | null) => {
    let item = bySiglum.get(siglum)
    if (!item) {
      item = { work, siglum, print: printBySiglum.get(siglum), piece, note, entries: [] }
      bySiglum.set(siglum, item)
    }
    return item
  }
  for (const appearance of work.printAppearances) {
    add(appearance.inPrint.replace(/^print:/, ''), appearance.piece, appearance.note ?? null)
  }
  const ownEntries = [
    ...work.entries,
    ...getExpressions(work).flatMap((expression) => expression.entries),
  ]
    .map((id) => entryById.get(id))
    .filter((entry): entry is CatalogueEntry => entry !== undefined)
  for (const entry of ownEntries) {
    if (entry.firstPrint) {
      add(entry.firstPrint, null, null).entries.push(entry)
    }
  }
  return Array.from(bySiglum.values()).sort((a, b) => comparePrintSigla(a.siglum, b.siglum))
}

// Die Sigel aller Drucke eines Werks, fuer Uebersicht und Suche
export function workPrintSigla(work: Work): string[] {
  return getWorkPrints(work).map((item) => item.siglum)
}

// Ein Verweis auf ein anderes Verzeichnis, etwa Boetticher "1581 e"
export interface PrintReference {
  catalogue: string | null
  value: string
}

const isRismReference = (reference: PrintReference) =>
  reference.catalogue === 'RISM' || (reference.catalogue === null && reference.value.startsWith('RISM '))

// Die Verweise eines Drucks in einheitlicher Form, fuer beide Datenstaende
// (Liste oder ein Feld je Verzeichnis, siehe Print.references)
function allPrintReferences(print: Print): PrintReference[] {
  if (Array.isArray(print.references)) {
    return print.references.map((value) => ({ catalogue: null, value }))
  }
  return Object.entries(print.references ?? {})
    .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
    .map(([catalogue, value]) => ({ catalogue, value }))
}

// Die Verweise ausser RISM, das gesondert steht (printRism)
export function printReferences(print: Print): PrintReference[] {
  return allPrintReferences(print).filter((reference) => !isRismReference(reference))
}

// RISM-Angabe eines Drucks: Link und Verweis aus dem Druckeverzeichnis
export interface PrintRismInfo {
  url: string | null
  // Verweis, etwa "1555 c [L 757"
  label: string | null
}

export function printRism(print: Print): PrintRismInfo | null {
  const reference = allPrintReferences(print).find(isRismReference)
  const referenceLabel = reference ? reference.value.replace(/^RISM\s+/, '') : null
  const url = print.rism
  if (!url && !referenceLabel) {
    return null
  }
  return { url, label: referenceLabel }
}
