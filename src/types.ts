// Rohdaten nach lassoDBData/schema/catalogue.schema.json (Branch
// werkverzeichnis-vorlage). Die Seiten arbeiten nicht direkt damit, sondern mit
// den Anzeigemodellen weiter unten, siehe catalogueData.ts.

export type LanguageText = Record<string, string>

export interface RawTitle {
  text: LanguageText
  type?: string
}

export interface RawIdentifier {
  list: string
  value: string
}

export interface RawContributor {
  agent: string
  role: string
  certainty?: string
}

export interface RawNote {
  label?: string
  html: string
}

// Fundstelle: Verweis auf einen Band samt Stelle
export interface Citation {
  inBibliography: string
  number?: string
  page?: number
  section?: string
  note?: string
}

export interface RawDate {
  date?: string
  description?: string
  certainty?: string
}

export interface RawPublication {
  label?: string
  startDate?: string
  endDate?: string
  place?: string
  publisherName?: string
}

export interface RawWork {
  '@id': string
  titles: RawTitle[]
  identifiers?: RawIdentifier[]
  contributors?: RawContributor[]
  status?: string
  genres?: string[]
  textSources?: string[]
  realisedIn?: string[]
  partOfWork?: string
  citations?: Citation[]
  sameAs?: string[]
  notes?: RawNote[]
}

export interface RawExpression {
  '@id': string
  label: string
  titles?: RawTitle[]
  identifiers?: RawIdentifier[]
  contributors?: RawContributor[]
  languages?: string[]
  instrumentation?: string
  partOfExpression?: string
  key?: { pitch?: string; accidental?: string; mode?: string; description?: string }
  meter?: { meterCount?: number; meterUnit?: number; meterSymbol?: string; description?: string }
  tempo?: string
  duration?: string
  incipit?: { pae?: string; incipitText?: LanguageText }
  dateCreated?: RawDate
  placeCreated?: string
  textSources?: string[]
  citations?: Citation[]
  sameAs?: string[]
  notes?: RawNote[]
}

export interface RawContent {
  // Fehlt, wenn das Stueck keinem Werk zugeordnet ist; dann ist titleInSource gesetzt
  embodies?: string
  position?: string
  part?: string
  titleInSource?: string
  voices?: number
  note?: string
}

export interface RawManifestation {
  '@id': string
  titles: RawTitle[]
  classifications?: string[]
  identifiers?: RawIdentifier[]
  contributors?: RawContributor[]
  titlePages?: { html: string }[]
  publication?: RawPublication
  partOfManifestation?: string
  contents?: RawContent[]
  sourceType?: string
  partbooks?: string
  dating?: string
  literature?: string[]
  sameAs?: string[]
  notes?: RawNote[]
}

export interface RawItem {
  '@id': string
  label: string
  keeper?: string
  shelfmark?: string
  formerShelfmark?: string
  exemplifies: string
  sameAs?: string[]
  notes?: RawNote[]
}

export interface RawPerson {
  '@id': string
  familyName: string
  givenName?: string
  alternateNames?: string[]
  sameAs?: string[]
}

export interface RawInstitution {
  '@id': string
  name: string
  siglum?: string
  abbreviation?: string
  place?: string
  sameAs?: string[]
}

export interface RawPlace {
  '@id': string
  name: string
}

export interface RawInstrumentation {
  '@id': string
  label: string
  details?: { position: number; medium?: string; description: string; quantity?: number }[]
}

export interface RawBibliography {
  '@id': string
  abbreviation: string
  titles?: RawTitle[]
  editors?: string[]
  publication?: RawPublication
  series?: string
  volumeNumber?: string
}

export interface RawCatalogue {
  label: string
  catalogueAbbreviation: string
  composer?: string
}

export interface Collection<T> {
  entries: T[]
}

// Anzeigemodelle

export interface Person {
  '@id': string
  preferredName: string
  variantNames: string[]
  // Adressen der Normdaten, sofern im Datensatz verlinkt
  gnd: string | null
  viaf: string | null
}

export interface Work {
  '@id': string
  slug: string
  // Katalognummer in der Zitierform, ohne Kürzel, wenn es die Hauptzählung ist
  number: string
  title: string
  variantTitles: string[]
  isPartOf: string | null
  hasPart: string[]
  voiceCounts: number[]
  textAuthors: string[]
  uncertainTextAuthors: string[]
  textSources: string[]
  citations: Citation[]
  genres: string[]
  languages: string[]
  // Weitere Expressions des Werks, also ausdrücklich gekennzeichnete Fassungen
  versions: string[]
  // Die Expression des Werks, Träger von Tonart, Incipit und so weiter
  expression: Expression | null
  status: string | null
  sameAs: string[]
  notes: RawNote[]
}

export interface Expression {
  '@id': string
  number: string
  title: string
  variantTitles: string[]
  voiceCounts: number[]
  textAuthors: string[]
  uncertainTextAuthors: string[]
  textSources: string[]
  citations: Citation[]
  languages: string[]
  key: string
  meter: string
  tempo: string
  duration: string
  incipitText: string
  incipitCode: string
  dateCreated: string
  placeCreated: string
  notes: RawNote[]
}

export type SourceKind = 'print' | 'manuscript' | 'other'

export interface SourceItem {
  '@id': string
  label: string
  place: string | null
  library: string | null
  librarySiglum: string | null
  shelfmark: string | null
  formerShelfmark: string | null
  links: string[]
  notes: RawNote[]
}

export interface Source {
  '@id': string
  slug: string
  // Kurzbezeichnung, bei Drucken die Sigle
  siglum: string
  kind: SourceKind
  title: string
  titlePage: string | null
  year: number | null
  // Datierung, wie sie angezeigt wird, etwa "ca. 1558"
  dateLabel: string
  place: string | null
  publisher: string | null
  description: string | null
  sourceType: string | null
  partbooks: string | null
  literature: string[]
  references: { catalogue: string; value: string }[]
  rismLabel: string | null
  rismUrl: string | null
  links: string[]
  items: SourceItem[]
  notes: RawNote[]
}

// Ein Stück in einer Quelle mit den Angaben, die nur dort gelten
export interface WorkInSource {
  work: Work
  // Gesetzt, wenn das Stück in dieser Quelle als eigene Fassung geführt ist
  version: Expression | null
  source: Source
  // Der frueheste Druck des Werks, aus dem Datum abgeleitet, siehe markEarliestPrints
  isEarliestPrint: boolean
  position: string | null
  part: string | null
  titleInSource: string | null
  voices: number | null
  note: string | null
}

// Ein Stueck in einer Quelle, das keinem Werk zugeordnet ist
export interface UnassignedPiece {
  title: string
  position: string | null
  part: string | null
  voices: number | null
  note: string | null
}

export interface Volume {
  '@id': string
  slug: string
  abbreviation: string
  title: string | null
  volumeNumber: string | null
  editors: string[]
  place: string | null
  publisher: string | null
  dateLabel: string
}

export interface Edition {
  '@id': string
  abbreviation: string
  title: string | null
  volumes: Volume[]
}

export interface VolumeContent {
  id: string
  work: Work
  catalogNumber: string
  title: string
  section: string | null
  // "Nr. 12" oder "S. 3"
  location: string
  note: string | null
  isNestedPart: boolean
}
