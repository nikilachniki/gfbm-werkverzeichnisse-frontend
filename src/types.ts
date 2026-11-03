// Entspricht dem Feldmodell aus lassoDBData/schema/entry.schema.json.
// Ein Werk kann in mehreren Drucken erscheinen, siehe Work.entries.

export interface Work {
  '@id': string
  '@type': 'Work'
  lv: string | null
  lvBase: number | null
  lvPart: number | null
  lvAnh: number | null
  // Teil-Beziehung: ein Teil wie "100-2" verweist auf sein Gesamtwerk
  // ("work:100"), das Gesamtwerk listet seine Teile.
  isPartOf: string | null
  hasPart: string[]
  // Normalisierter Werktitel . Die abweichenden Drucktitel stehen in variantTitles.
  preferredTitle: string | null
  preferredTitleBasis: TitleBasis
  variantTitles: string[]
  voiceCounts: number[]
  // Sigel der Erstdrucke, aus den Eintraegen
  prints: string[]
  // Alle Drucke, in denen das Werk steht, auch Nachdrucke, chronologisch.
  // Das Register fuehrt nur Grundnummern, Teile haben deshalb keine eigenen.
  printAppearances: PrintAppearance[]
  // Personen-IDs (person:...), nicht Rohwerte, siehe Person
  textAuthors: string[]
  // Teilmenge von textAuthors, deren Zuschreibung in allen Eintraegen unsicher
  // ist (Rohwert mit "?", etwa "Ludwig Helmbold?")
  uncertainTextAuthors: string[]
  textSources: string[]
  // Fundstellen in den Baenden der Gesamtausgaben, siehe Edition
  editionAppearances: EditionAppearance[]
  // Gattung und Sprache aus den Eintraegen, Rohwerte ohne Dubletten
  genres: string[]
  languages: string[]
  entries: string[]
  manuscripts: string[]
  // Fassungen des Werks, siehe Expression
  expressions: string[]
}

// Ein Werk in einem Druck laut Gesamtregister: Stuecknummer im Druck und
// ein Zusatz wie "nur II." oder "Vers 8"
export interface PrintAppearance {
  inPrint: string
  piece: string | null
  note?: string
}

// Ein Werk oder eine Fassung in einem Band der Gesamtausgabe: mit Stuecknummer
// oder Seite, bei Bedarf im Anhang des Bandes und mit Zusatz wie "†"
export interface EditionAppearance {
  inVolume: string
  number?: string
  page?: number
  appendix?: string
  note?: string
}

// Eine Gesamtausgabe (GA, GA², NR) mit ihren Baenden. Moderne Editionen, keine
// Quellen, deshalb getrennt von den Drucken.
export interface Edition {
  '@id': string
  '@type': 'Edition'
  siglum: string
  title: string
  volumes: Volume[]
}

export interface Volume {
  '@id': string
  '@type': 'Volume'
  volume: string
  title: string | null
  editors: string[]
  place: string | null
  publisher: string | null
  year: number | null
  parts: VolumePart[]
}

// Ein Teilband wie "VIII,I": Ziel von Fundstellen, die bibliographischen Angaben
// stehen am Band.
export interface VolumePart {
  '@id': string
  '@type': 'VolumePart'
  volume: string
}

export interface EditionsFile {
  '@context': string
  items: Edition[]
}

// Woher der preferredTitle stammt: normalisierter Titel oder frueheste Quelle
export type TitleBasis = 'normalized' | 'earliestSource'

export interface WorksFile {
  '@context': string
  items: Work[]
}

// Eine Werk-Fassung im Sinne von FRBR (Expression)
export interface Expression {
  '@id': string
  '@type': 'Expression'
  lv: string
  lvBase: number
  pars: string
  realizationOf: string
  preferredTitle: string | null
  preferredTitleBasis: TitleBasis
  variantTitles: string[]
  voiceCounts: number[]
  prints: string[]
  textAuthors: string[]
  uncertainTextAuthors: string[]
  textSources: string[]
  editionAppearances: EditionAppearance[]
  genres: string[]
  languages: string[]
  entries: string[]
}

export interface ExpressionsFile {
  '@context': string
  items: Expression[]
}

// Ein Eintrag entspricht einem Werk in genau einem Druck, nicht dem Werk
// selbst. Dieselbe Komposition kann als mehrere Eintraege auftauchen, wenn
// sie in mehreren Drucken erschienen ist; das Work-Objekt fasst sie zusammen.
export interface CatalogueEntry {
  '@id': string
  '@type': 'CatalogueEntry'
  lv: string | null
  lvBase: number | null
  lvPart: number | null
  lvVariant: string | null
  // Titel in der Schreibung des Drucks (diplomatisch)
  title: string | null
  // Werktitel in normalisierter Schreibung, siehe Work.preferredTitle
  normalizedTitle: string | null
  normalizedTitleBasis: string | null
  voices: number | null
  voicesRaw?: string
  firstPrint: string | null
  firstPrintYear: number | null
  firstPrintNo: number | null
  // Rohwert, wie ihn der Druck schreibt; die Person dazu in textAuthorPerson
  textAuthor: string | null
  textAuthorPerson: string | null
  textAuthorUncertain: boolean
  textSource: string | null
  completeEdition: string | null
  note: string | null
  genre: string | null
  language: string | null
}

export interface EntriesFile {
  '@context': string
  items: CatalogueEntry[]
}

// Ein Druck, identifiziert ueber das Sigel aus dem Druckeverzeichnis (etwa
// "1555-1", Jahr und laufende Nummer, bei mehrbaendigen Drucken mit Band wie
// "1575-3/I"). Die Eintraege verweisen per firstPrint auf das Sigel, die Werke
// per printAppearances auf die @id.
export interface Print {
  '@id': string
  '@type': 'Print'
  siglum: string
  year: number | null
  // Band bei mehrbaendigen Drucken, roemisch
  part: string | null
  // Datierung im Register mit "ca."
  dateApproximate: boolean
  // Angaben aus dem Druckeverzeichnis (lassoDBData, entscheidungen.md,
  // Abschnitt 26), diplomatisch uebernommen.
  // Ueberschrift unter der Sigle, etwa "Nachdruck von 1555-1"
  description: string | null
  // Verweise auf andere Verzeichnisse. Neu ein Feld je Verzeichnis
  // ({ RISM: "1581 a [L 924", Boetticher: "1581 e" }), im aelteren Datenstand
  // eine Liste ("Boetticher 1555 a"); siehe printReferences in worksData.
  // Werte mit undefined, weil TypeScript beim Import der JSON-Datei jedem
  // Druck die Verzeichnisse der uebrigen als optionale Felder zuschreibt.
  references: string[] | Record<string, string | undefined>
  // Link auf RISM Online, ermittelt aus der RISM-Nummer im Verzeichnis
  rism: string | null
  // Titelblatt, Zeilenwechsel als "|", Zusaetze des Verzeichnisses in ⟨⟩
  title: string | null
  // Normalisierter Kurztitel, etwa "Il primo libro di madrigali a cinque voci"
  shortTitle: string | null
  // Stimmbuecher, durch ";" getrennt, oder "Chorbuch"
  partbooks: string | null
  // Werke mit Erstdruck in diesem Druck (Eintraege)
  entryCount: number
}

export interface PrintsFile {
  '@context': string
  items: Print[]
}

// Ein Zeugnis entspricht einem Lasso-Stueck in einer Handschrift, nicht dem
// Werk selbst. Dieselbe Komposition kann in mehreren Handschriften
// ueberliefert sein, und eine Handschrift kann mehrere Stuecke enthalten.
export interface ManuscriptWitness {
  '@id': string
  '@type': 'ManuscriptWitness'
  lv: string | null
  lvBase: number | null
  lvPart: number | null
  lvAnh: number | null
  title: string | null
  voices: number | null
  voicesRaw?: string
  dating: string | null
  rismSiglum: string | null
  link: string | null
  place: string | null
  library: string | null
  shelfmark: string | null
  shelfmarkAlt: string | null
  sourceType: string | null
  provenance: string | null
  sourceNote: string | null
  literature: string | null
  note: string | null
}

export interface ManuscriptsFile {
  '@context': string
  items: ManuscriptWitness[]
}

// Ein Textdichter. Schreibvarianten mit kuratierter GND-Zuordnung sind zu
// einer Person mit festgelegter Anzeigeform zusammengefuehrt
export interface Person {
  '@id': string
  '@type': 'Person'
  preferredName: string
  // Abweichende Schreibweisen aus der Quelle, ohne preferredName
  variantNames: string[]
  // GND und VIAF als vollstaendige Adresse, etwa https://d-nb.info/gnd/118593234
  gnd: string | null
  viaf: string | null
}

export interface PersonsFile {
  '@context': string
  items: Person[]
}
