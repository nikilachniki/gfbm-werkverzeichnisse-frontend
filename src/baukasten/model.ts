// Die Bausteine des Werkverzeichnis-Baukastens: Datentypen, Felder und Vorlagen.
// Die Felder entsprechen der Vorlage (gfbm-werkverzeichnisse/schema/catalogue.schema.json). Ob das noch stimmt,
// prueft scripts/check-baukasten.ts gegen Schema und Kontext.

export const ENTITY_KEYS = [
  'works',
  'expressions',
  'manifestations',
  'items',
  'persons',
  'institutions',
  'places',
  'instrumentations',
  'bibliography',
] as const
export type EntityKey = (typeof ENTITY_KEYS)[number]

export interface Option {
  value: string
  label: string
}

// Nur Begriffe, die in den vorhandenen Daten belegt sind. Das MeLODy-Vokabular kennt
// mehr; die vollstaendigen Listen liegen nicht im Repository.
const LANGUAGES: Option[] = [
  { value: 'terms:Latin', label: 'Latein' },
  { value: 'terms:Italian', label: 'Italienisch' },
  { value: 'terms:French', label: 'Französisch' },
  { value: 'terms:German', label: 'Deutsch' },
]
const ROLES: Option[] = [
  { value: 'terms:Composer', label: 'Komposition' },
  { value: 'terms:Lyricist', label: 'Text' },
]
const CERTAINTY: Option[] = [
  { value: 'terms:MediumCertainty', label: 'mittel' },
  { value: 'terms:LowCertainty', label: 'gering' },
]

export type Input =
  | { kind: 'text'; multiline?: boolean; html?: boolean; placeholder?: string }
  | { kind: 'number' }
  | { kind: 'date' }
  | { kind: 'link' }
  | { kind: 'select'; options: Option[] }
  | { kind: 'strings'; placeholder?: string }
  | { kind: 'terms'; options: Option[] }
  | { kind: 'links' }
  | { kind: 'ref'; to: EntityKey; create?: boolean }
  | { kind: 'refs'; to: EntityKey; create?: boolean }
  | { kind: 'langText' }
  | { kind: 'titles'; typed: boolean; max?: number }
  | { kind: 'object'; parts: Part[] }
  | { kind: 'rows'; parts: Part[]; addLabel: string; indexKey?: string; defaults?: Record<string, unknown> }
  | { kind: 'piece' }
  // Wird abgeleitet und nie eingegeben.
  | { kind: 'auto' }

export interface Part {
  key: string
  label: string
  input: Input
  // Teilfeld, das einzeln abgewaehlt werden kann, etwa die Stimmenzahl je Stueck.
  toggle?: boolean
  origin?: Origin
  required?: boolean
  help?: string
}

// melody: Begriff aus MeLODy. wv: eigene Erweiterung, wird beim Export zu Text.
export type Origin = 'melody' | 'wv'

export interface FieldDef extends Part {
  origin: Origin
  help: string
  // Verlinkt das erste Vorkommen von text in der Hilfe.
  link?: { text: string; href: string }
  // Immer dabei, nicht abwaehlbar.
  required?: boolean
  // Fuellt das Werkzeug selbst.
  derived?: string
}

export interface EntityDef {
  key: EntityKey
  type: string
  label: string
  plural: string
  file: string
  blurb: string
  // Teil der Kette Werk, Expression, Quelle, Exemplar.
  chain?: boolean
  // Nicht abwaehlbar.
  locked?: string
  // Setzt einen anderen Datentyp voraus.
  requires?: EntityKey
  fields: FieldDef[]
}

const titles = (typed: boolean, max?: number): Input => ({ kind: 'titles', typed, max })
const links: Input = { kind: 'links' }
const dateInput: Input = {
  kind: 'object',
  parts: [
    { key: 'description', label: 'Wie in der Literatur', input: { kind: 'text', placeholder: 'um 1585' } },
    { key: 'date', label: 'Maschinenlesbar', input: { kind: 'date' } },
    { key: 'certainty', label: 'Sicherheit', input: { kind: 'select', options: CERTAINTY } },
  ],
}
const publicationInput: Input = {
  kind: 'object',
  parts: [
    { key: 'label', label: 'Angabe', input: { kind: 'text', placeholder: 'Löwen 1560' } },
    { key: 'startDate', label: 'Von', input: { kind: 'date' } },
    { key: 'endDate', label: 'Bis', input: { kind: 'date' } },
    { key: 'place', label: 'Ort', input: { kind: 'ref', to: 'places', create: true } },
    { key: 'publisherName', label: 'Verlag', input: { kind: 'text' } },
  ],
}
const identifiersInput: Input = {
  kind: 'rows',
  addLabel: 'Nummer ergänzen',
  parts: [
    { key: 'list', label: 'Verzeichnis', input: { kind: 'text' } },
    { key: 'value', label: 'Nummer', input: { kind: 'text' } },
  ],
}
const contributorsInput: Input = {
  kind: 'rows',
  addLabel: 'Person ergänzen',
  defaults: { role: 'terms:Lyricist' },
  parts: [
    { key: 'agent', label: 'Person', input: { kind: 'ref', to: 'persons', create: true } },
    { key: 'role', label: 'Rolle', input: { kind: 'select', options: ROLES } },
    { key: 'certainty', label: 'Sicherheit', input: { kind: 'select', options: CERTAINTY } },
  ],
}
const notesInput: Input = {
  kind: 'rows',
  addLabel: 'Anmerkung ergänzen',
  parts: [
    { key: 'label', label: 'Art', input: { kind: 'text', placeholder: 'Bemerkung' } },
    { key: 'html', label: 'Text', input: { kind: 'text', multiline: true, html: true } },
  ],
}
const citationsInput: Input = {
  kind: 'rows',
  addLabel: 'Fundstelle ergänzen',
  parts: [
    { key: 'inBibliography', label: 'Band', input: { kind: 'ref', to: 'bibliography', create: true } },
    { key: 'section', label: 'Abschnitt', input: { kind: 'text' } },
    { key: 'number', label: 'Nr.', input: { kind: 'text' } },
    { key: 'page', label: 'Seite', input: { kind: 'number' } },
  ],
}

const SAME_AS_HELP = 'Links zu Normdaten oder anderen Katalogen, etwa GND oder RISM.'

export const ENTITIES: EntityDef[] = [
  {
    key: 'works',
    type: 'Work',
    label: 'Werk',
    plural: 'Werke',
    file: 'works.json',
    blurb: 'Die Komposition als Idee, unabhängig von Fassung und Überlieferung.',
    chain: true,
    locked: 'Ohne Werk kein Werkverzeichnis.',
    fields: [
      { key: 'titles', label: 'Titel', origin: 'melody', required: true, help: 'Genau ein Haupttitel, dazu beliebig viele Titelvarianten.', input: titles(true) },
      { key: 'identifiers', label: 'Verzeichnisnummer', origin: 'melody', help: 'Etwa LV 90 oder op. 17. Die ID des Werks wird daraus gebildet.', input: identifiersInput },
      { key: 'contributors', label: 'Beteiligte', origin: 'melody', help: 'Komposition und Text.', input: contributorsInput },
      { key: 'status', label: 'Echtheit', origin: 'melody', help: 'Authentisch, zweifelhaft oder unecht.', input: { kind: 'text', placeholder: 'authentic' } },
      { key: 'genres', label: 'Gattung', origin: 'wv', help: 'Freier Text.', input: { kind: 'strings', placeholder: 'Sonate' } },
      { key: 'realisedIn', label: 'Verknüpfung zur Fassung', origin: 'melody', required: true, derived: 'Trägt der Baukasten selbst ein.', help: 'Der Pflichtverweis vom Werk auf seine Fassungen.', input: { kind: 'auto' } },
      { key: 'partOfWork', label: 'Teil von', origin: 'melody', help: 'Für Sätze, Partes oder Stücke einer Sammlung. Die Fassung erhält den passenden Verweis automatisch.', input: { kind: 'ref', to: 'works' } },
      { key: 'citations', label: 'Fundstellen in Ausgaben', origin: 'wv', help: 'Band, Nummer und Seite in einer Gesamtausgabe.', input: citationsInput },
      { key: 'textSources', label: 'Textprovenienz', origin: 'wv', help: 'Herkunft des vertonten Texts, etwa eine Bibelstelle.', input: { kind: 'strings', placeholder: 'Psalm 150' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: SAME_AS_HELP, input: links },
      { key: 'notes', label: 'Anmerkungen', origin: 'melody', help: 'Freie Anmerkungen zum Werk.', input: notesInput },
    ],
  },
  {
    key: 'expressions',
    type: 'Expression',
    label: 'Fassung',
    plural: 'Fassungen',
    file: 'expressions.json',
    blurb: 'Eine musikalische Gestalt des Werks, etwa eine Fassung oder Besetzung.',
    chain: true,
    locked: 'FRBR verlangt sie: Quellen verweisen auf die Fassung, nicht auf das Werk.',
    fields: [
      { key: 'label', label: 'Bezeichnung', origin: 'melody', required: true, derived: 'Folgt dem Werktitel, solange keine eigene vergeben ist.', help: 'Name der Gestalt.', input: { kind: 'auto' } },
      { key: 'titles', label: 'Eigene Titel', origin: 'melody', help: 'Wenn die Fassung anders heißt als das Werk.', input: titles(false) },
      { key: 'identifiers', label: 'Eigene Nummer', origin: 'melody', help: 'Etwa 74 (IV) für eine eigens gezählte Fassung.', input: identifiersInput },
      { key: 'contributors', label: 'Beteiligte an der Fassung', origin: 'melody', help: 'Etwa wer eine Bearbeitung eingerichtet hat.', input: contributorsInput },
      { key: 'languages', label: 'Sprache', origin: 'melody', help: 'Wird beim Speichern aus der Sprache des Titels vorbelegt.', input: { kind: 'terms', options: LANGUAGES } },
      { key: 'instrumentation', label: 'Besetzung', origin: 'melody', help: 'Verweis auf einen Besetzungs-Datensatz. Nur setzen, wenn sie eindeutig ist.', input: { kind: 'ref', to: 'instrumentations', create: true } },
      { key: 'key', label: 'Tonart', origin: 'melody', help: 'Als Text, etwa D-Dur.', input: { kind: 'object', parts: [{ key: 'description', label: 'Tonart', input: { kind: 'text', placeholder: 'D-Dur' } }] } },
      {
        key: 'meter',
        label: 'Metrum',
        origin: 'melody',
        help: 'Zähler und Nenner oder ein Zeichen wie C, dazu bei Bedarf eine Angabe als Text.',
        input: {
          kind: 'object',
          parts: [
            { key: 'meterCount', label: 'Zähler', input: { kind: 'number' } },
            { key: 'meterUnit', label: 'Nenner', input: { kind: 'number' } },
            { key: 'meterSymbol', label: 'Zeichen', input: { kind: 'text', placeholder: 'C' } },
            { key: 'description', label: 'Als Text', input: { kind: 'text', placeholder: 'wechselnd 3/4 und 6/8' } },
          ],
        },
      },
      { key: 'tempo', label: 'Tempo', origin: 'melody', help: 'Tempoangabe, etwa Allegro.', input: { kind: 'text', placeholder: 'Allegro' } },
      { key: 'duration', label: 'Dauer', origin: 'melody', help: 'Aufführungsdauer.', input: { kind: 'text', placeholder: 'ca. 20 Min.' } },
      {
        key: 'incipit',
        label: 'Incipit',
        origin: 'melody',
        help: 'Notenincipit in PAE und Textanfang.',
        link: { text: 'PAE', href: 'https://de.wikipedia.org/wiki/Plaine_%26_Easie_Code' },
        input: {
          kind: 'object',
          parts: [
            { key: 'pae', label: 'PAE', input: { kind: 'text', placeholder: '%G-2 @3/4 4C8DE' } },
            { key: 'incipitText', label: 'Textanfang', input: { kind: 'langText' } },
          ],
        },
      },
      { key: 'dateCreated', label: 'Entstehungszeit', origin: 'melody', help: 'Angabe wie in der Literatur, dazu ein maschinenlesbares Datum.', input: dateInput },
      { key: 'placeCreated', label: 'Entstehungsort', origin: 'melody', help: 'Verweis auf einen Ort.', input: { kind: 'ref', to: 'places', create: true } },
      { key: 'citations', label: 'Fundstellen in Ausgaben', origin: 'wv', help: 'Wenn eine Fassung anderswo steht als das Werk.', input: citationsInput },
      { key: 'textSources', label: 'Textprovenienz', origin: 'wv', help: 'Wenn eine Fassung einen anderen Text vertont.', input: { kind: 'strings' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: SAME_AS_HELP, input: links },
      { key: 'notes', label: 'Anmerkungen', origin: 'melody', help: 'Freie Anmerkungen zur Fassung.', input: notesInput },
    ],
  },
  {
    key: 'manifestations',
    type: 'Manifestation',
    label: 'Quelle',
    plural: 'Quellen',
    file: 'manifestations.json',
    blurb: 'Druck oder Handschrift. Auch verlorene Werke ohne Quelle bleiben damit zulässig.',
    chain: true,
    fields: [
      { key: 'titles', label: 'Titel', origin: 'melody', required: true, help: 'Name des Drucks oder Bezeichnung der Handschrift.', input: titles(false, 1) },
      { key: 'classifications', label: 'Art', origin: 'melody', help: 'Druck oder Handschrift.', input: { kind: 'terms', options: [{ value: 'terms:Print', label: 'Druck' }, { value: 'terms:Manuscript', label: 'Handschrift' }] } },
      { key: 'identifiers', label: 'Sigle und Katalognummern', origin: 'melody', help: 'Etwa RISM, Sigle oder Plattennummer.', input: identifiersInput },
      {
        key: 'contents',
        label: 'Enthaltene Stücke',
        origin: 'wv',
        help: 'Man wählt das Werk, der Verweis geht automatisch auf dessen Fassung.',
        input: {
          kind: 'rows',
          addLabel: 'Stück ergänzen',
          parts: [
            { key: 'embodies', label: 'Werk', origin: 'melody', input: { kind: 'piece' } },
            { key: 'position', label: 'Nr. in der Quelle', toggle: true, origin: 'wv', help: 'Stücknummer im Druck.', input: { kind: 'text' } },
            { key: 'part', label: 'Teil', toggle: true, origin: 'wv', help: 'Etwa die secunda pars.', input: { kind: 'text' } },
            { key: 'titleInSource', label: 'Titel in der Quelle', toggle: true, origin: 'wv', help: 'Wortlaut der Quelle. Ohne Werk ist er das einzige Merkmal des Stücks.', input: { kind: 'text' } },
            { key: 'voices', label: 'Stimmen', toggle: true, origin: 'wv', help: 'Stimmenzahl in dieser Quelle. Bei Renaissance-Repertoire weicht sie oft ab.', input: { kind: 'number' } },
            { key: 'note', label: 'Bemerkung', toggle: true, origin: 'wv', help: 'Bemerkung zum Stück in dieser Quelle.', input: { kind: 'text' } },
          ],
        },
      },
      { key: 'publication', label: 'Erscheinungsangaben', origin: 'melody', help: 'Ort, Verlag und Datum eines Drucks.', input: publicationInput },
      { key: 'titlePages', label: 'Titelblatt', origin: 'melody', help: 'Diplomatische Wiedergabe.', input: { kind: 'rows', addLabel: 'Titelblatt ergänzen', parts: [{ key: 'html', label: 'Wortlaut', input: { kind: 'text', multiline: true, html: true } }] } },
      { key: 'contributors', label: 'Beteiligte', origin: 'melody', help: 'Etwa Schreiber*in oder Herausgeber*in.', input: contributorsInput },
      { key: 'partOfManifestation', label: 'Teil von', origin: 'melody', help: 'Etwa ein Stimmbuch innerhalb eines Sets.', input: { kind: 'ref', to: 'manifestations' } },
      { key: 'sourceType', label: 'Quellenart', origin: 'wv', help: 'Etwa Stimmbücher (6) oder Partitur.', input: { kind: 'text' } },
      { key: 'partbooks', label: 'Stimmbücher', origin: 'wv', help: 'Vorhandene Stimmbücher, etwa Cantus; Tenor; Bassus.', input: { kind: 'text' } },
      { key: 'dating', label: 'Datierung der Handschrift', origin: 'wv', help: 'Text wie in der Literatur. Drucke tragen ihr Datum in den Erscheinungsangaben.', input: { kind: 'text', placeholder: 'um 1585' } },
      { key: 'literature', label: 'Literatur', origin: 'wv', help: 'Literaturangaben als Text.', input: { kind: 'strings' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: SAME_AS_HELP, input: links },
      { key: 'notes', label: 'Anmerkungen', origin: 'melody', help: 'Etwa zur Provenienz.', input: notesInput },
    ],
  },
  {
    key: 'items',
    type: 'Item',
    label: 'Exemplar',
    plural: 'Exemplare',
    file: 'items.json',
    blurb: 'Ein konkretes Exemplar, etwa ein Druck in einer bestimmten Bibliothek mit Signatur. Bei Handschriften gibt es meist genau eines.',
    chain: true,
    requires: 'manifestations',
    fields: [
      { key: 'label', label: 'Bezeichnung', origin: 'melody', required: true, derived: 'Wird aus der Signatur gebildet, wenn nichts eingetragen ist.', help: 'Kurzname des Exemplars.', input: { kind: 'text' } },
      { key: 'exemplifies', label: 'Exemplar von', origin: 'melody', required: true, help: 'Die Quelle, zu der das Exemplar gehört.', input: { kind: 'ref', to: 'manifestations' } },
      { key: 'keeper', label: 'Aufbewahrungsort', origin: 'melody', help: 'Bibliothek oder Archiv.', input: { kind: 'ref', to: 'institutions', create: true } },
      { key: 'shelfmark', label: 'Signatur', origin: 'melody', help: 'Aktuelle Signatur.', input: { kind: 'text' } },
      { key: 'formerShelfmark', label: 'Frühere Signatur', origin: 'melody', help: 'Vorherige Signatur, falls bekannt.', input: { kind: 'text' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: 'Etwa zum Digitalisat.', input: links },
      { key: 'notes', label: 'Anmerkungen', origin: 'melody', help: 'Etwa zum Erhaltungszustand.', input: notesInput },
    ],
  },
  {
    key: 'persons',
    type: 'Person',
    label: 'Person',
    plural: 'Personen',
    file: 'persons.json',
    blurb: 'Komponist*innen, Textdichter*innen, Herausgeber*innen.',
    fields: [
      { key: 'familyName', label: 'Familienname', origin: 'melody', required: true, help: 'Wird beim Anlegen aus dem eingegebenen Namen gebildet.', input: { kind: 'text' } },
      { key: 'givenName', label: 'Vorname', origin: 'melody', help: 'Vorname oder Vornamen.', input: { kind: 'text' } },
      { key: 'alternateNames', label: 'Namensvarianten', origin: 'melody', help: 'Etwa Orlande de Lassus.', input: { kind: 'strings' } },
      { key: 'birthDate', label: 'Geburt', origin: 'melody', help: 'Datum wie in der Literatur.', input: dateInput },
      { key: 'deathDate', label: 'Tod', origin: 'melody', help: 'Datum wie in der Literatur.', input: dateInput },
      { key: 'birthPlace', label: 'Geburtsort', origin: 'melody', help: 'Verweis auf einen Ort.', input: { kind: 'ref', to: 'places', create: true } },
      { key: 'deathPlace', label: 'Sterbeort', origin: 'melody', help: 'Verweis auf einen Ort.', input: { kind: 'ref', to: 'places', create: true } },
      { key: 'occupations', label: 'Tätigkeiten', origin: 'melody', help: 'Etwa Komponistin, Pianistin.', input: { kind: 'strings' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: 'Etwa GND oder VIAF.', input: links },
    ],
  },
  {
    key: 'institutions',
    type: 'Institution',
    label: 'Institution',
    plural: 'Institutionen',
    file: 'institutions.json',
    blurb: 'Bibliotheken und Archive.',
    fields: [
      { key: 'name', label: 'Name', origin: 'melody', required: true, help: 'Name der Einrichtung.', input: { kind: 'text' } },
      { key: 'siglum', label: 'Bibliothekssigel', origin: 'melody', help: 'Etwa D-Mbs.', input: { kind: 'text' } },
      { key: 'abbreviation', label: 'Abkürzung', origin: 'melody', help: 'Etwa BSB.', input: { kind: 'text' } },
      { key: 'place', label: 'Ort', origin: 'melody', help: 'Verweis auf einen Ort.', input: { kind: 'ref', to: 'places', create: true } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: 'Etwa GND.', input: links },
    ],
  },
  {
    key: 'places',
    type: 'Place',
    label: 'Ort',
    plural: 'Orte',
    file: 'places.json',
    blurb: 'Druck-, Entstehungs- und Lebensorte.',
    fields: [
      { key: 'name', label: 'Name', origin: 'melody', required: true, help: 'Name des Orts.', input: { kind: 'text' } },
      { key: 'country', label: 'Land', origin: 'melody', help: 'GeoNames-Adresse des Landes.', input: { kind: 'link' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: 'Etwa GeoNames.', input: links },
    ],
  },
  {
    key: 'instrumentations',
    type: 'Instrumentation',
    label: 'Besetzung',
    plural: 'Besetzungen',
    file: 'instrumentations.json',
    blurb: 'Wiederverwendbare Besetzungen, etwa „5 Stimmen“.',
    fields: [
      { key: 'label', label: 'Bezeichnung', origin: 'melody', required: true, help: 'Etwa 5 Stimmen oder Violoncello und Klavier.', input: { kind: 'text' } },
      {
        key: 'details',
        label: 'Einzelne Besetzungsglieder',
        origin: 'melody',
        help: 'Besetzung als Struktur statt nur als Text.',
        input: {
          kind: 'rows',
          addLabel: 'Glied ergänzen',
          indexKey: 'position',
          parts: [
            { key: 'description', label: 'Stimme oder Instrument', input: { kind: 'text' } },
            { key: 'quantity', label: 'Anzahl', input: { kind: 'number' } },
          ],
        },
      },
    ],
  },
  {
    key: 'bibliography',
    type: 'Bibliography',
    label: 'Literatur',
    plural: 'Literatur',
    file: 'bibliography.json',
    blurb: 'Literatur, Ausgaben und ihre Bände.',
    fields: [
      { key: 'abbreviation', label: 'Sigel', origin: 'melody', required: true, help: 'Kurzform, unter der zitiert wird.', input: { kind: 'text' } },
      { key: 'genre', label: 'Art', origin: 'melody', help: 'Art der Publikation.', input: { kind: 'select', options: [{ value: 'terms:Book', label: 'Buch' }] } },
      { key: 'titles', label: 'Titel', origin: 'melody', help: 'Voller Titel.', input: titles(false) },
      { key: 'authors', label: 'Autor*innen', origin: 'melody', help: 'Verweise auf Personen.', input: { kind: 'refs', to: 'persons', create: true } },
      { key: 'editors', label: 'Herausgeber*innen', origin: 'melody', help: 'Verweise auf Personen.', input: { kind: 'refs', to: 'persons', create: true } },
      { key: 'publication', label: 'Erscheinungsangaben', origin: 'melody', help: 'Ort, Verlag und Jahr.', input: publicationInput },
      { key: 'series', label: 'Reihe', origin: 'melody', help: 'Etwa der Reihentitel einer Gesamtausgabe.', input: { kind: 'ref', to: 'bibliography' } },
      { key: 'volumeNumber', label: 'Bandnummer', origin: 'melody', help: 'Band innerhalb der Reihe.', input: { kind: 'text' } },
      { key: 'pagination', label: 'Seitenangabe', origin: 'melody', help: 'Etwa 45–60.', input: { kind: 'text' } },
      { key: 'sameAs', label: 'Externe Links', origin: 'melody', help: 'Etwa zum Bibliothekskatalog.', input: links },
    ],
  },
]

export const entityOf = (key: EntityKey): EntityDef => ENTITIES.find((entity) => entity.key === key)!

// Wie Werk und Expression zusammenhaengen.
export type ExpressionMode = 'auto' | 'manual'

export interface Config {
  presetId: PresetId
  // Das Kuerzel ist zugleich die Liste, nach der neue Werke nummeriert werden.
  catalogue: { label: string; abbreviation: string; composer: string }
  entities: Record<EntityKey, boolean>
  // Schluessel: "works.genres" und "manifestations.contents.voices"
  fields: Record<string, boolean>
  expressionMode: ExpressionMode
}

export type PresetId = 'lasso' | 'lebeau' | 'blank'

export interface Preset {
  id: PresetId
  name: string
  // Komponist*in, an der die Vorlage entstanden ist.
  example?: string
  description: string
  highlights: string[]
  config: Omit<Config, 'presetId'>
}

const allEntities = (off: EntityKey[] = []) =>
  Object.fromEntries(ENTITY_KEYS.map((key) => [key, !off.includes(key)])) as Record<EntityKey, boolean>

const fieldsOn = (selection: Partial<Record<EntityKey, string[]>>) =>
  Object.fromEntries(
    Object.entries(selection).flatMap(([entity, keys]) => (keys ?? []).map((key) => [`${entity}.${key}`, true])),
  )

export const PRESETS: Preset[] = [
  {
    id: 'lasso',
    name: 'Mittelalter und Renaissance',
    example: 'Orlando di Lasso',
    description: 'Fokus auf der Überlieferung: viele Stücke in vielen Drucken und Handschriften.',
    highlights: ['Stimmenzahl je Quelle', 'Stimmbücher, Titelblätter, Partes'],
    config: {
      catalogue: { label: 'Werkverzeichnis Orlando di Lasso', abbreviation: 'LV', composer: 'Lasso, Orlando di' },
      entities: allEntities(),
      expressionMode: 'auto',
      // Auswahl nach der Feldnutzung in examples/lasso-schwierig. Die Gattung bleibt aus,
      // weil ihre Bestimmung bei Lasso noch ungeklaert ist (Kontrafakturen).
      fields: fieldsOn({
        works: ['identifiers', 'contributors', 'partOfWork', 'citations', 'textSources'],
        expressions: ['languages', 'instrumentation', 'identifiers', 'titles', 'citations', 'notes', 'textSources'],
        manifestations: ['classifications', 'identifiers', 'contents', 'contents.position', 'contents.part', 'contents.titleInSource', 'contents.voices', 'contents.note', 'publication', 'titlePages', 'sourceType', 'partbooks', 'dating', 'literature', 'sameAs', 'notes'],
        items: ['keeper', 'shelfmark', 'formerShelfmark', 'sameAs'],
        persons: ['givenName', 'alternateNames', 'sameAs'],
        institutions: ['siglum', 'place'],
        instrumentations: ['details'],
        bibliography: ['genre', 'titles', 'editors', 'publication', 'series', 'volumeNumber'],
      }),
    },
  },
  {
    id: 'lebeau',
    name: 'Klassik bis Moderne',
    example: 'Luise Adolpha Le Beau',
    description: 'Fokus auf dem Werk und seinen Fassungen: Opuszählung, feste Besetzungen und Bearbeitungen. Quellen lassen sich bei Bedarf zuschalten.',
    highlights: ['Erste Fassung entsteht automatisch', 'Tonart, Tempo, Dauer, Incipit', 'Entstehungszeit und -ort der Werke'],
    config: {
      catalogue: { label: 'Werkverzeichnis Luise Adolpha Le Beau', abbreviation: 'LBWV', composer: 'Le Beau, Luise Adolpha' },
      // Quellen und Exemplare zunaechst aus, Institutionen braucht dann nur noch das Exemplar.
      // Die Feldauswahl dafuer steht trotzdem bereit, falls man sie einschaltet.
      entities: allEntities(['manifestations', 'items', 'institutions']),
      expressionMode: 'auto',
      fields: fieldsOn({
        works: ['identifiers', 'contributors', 'status', 'genres', 'partOfWork', 'sameAs', 'notes'],
        expressions: ['contributors', 'languages', 'instrumentation', 'key', 'meter', 'tempo', 'duration', 'incipit', 'dateCreated', 'placeCreated', 'notes'],
        manifestations: ['classifications', 'identifiers', 'contents', 'contents.position', 'contents.note', 'publication', 'titlePages', 'dating', 'sameAs', 'notes'],
        items: ['keeper', 'shelfmark', 'sameAs'],
        persons: ['givenName', 'alternateNames', 'birthDate', 'deathDate', 'birthPlace', 'deathPlace', 'occupations', 'sameAs'],
        institutions: ['siglum', 'place', 'sameAs'],
        places: ['sameAs'],
        instrumentations: ['details'],
        bibliography: ['genre', 'titles', 'authors', 'editors', 'publication'],
      }),
    },
  },
  {
    id: 'blank',
    name: 'Ohne Vorlage',
    description: 'Ein schlanker Anfang mit Werken und ihren Fassungen. Alles Weitere wählst du selbst.',
    highlights: ['Nur Pflichtfelder', 'Alle Bausteine frei wählbar'],
    config: {
      catalogue: { label: '', abbreviation: '', composer: '' },
      entities: allEntities(['manifestations', 'items', 'persons', 'institutions', 'places', 'instrumentations', 'bibliography']),
      expressionMode: 'auto',
      fields: {},
    },
  },
]

export const presetOf = (id: PresetId): Preset => PRESETS.find((preset) => preset.id === id)!

export const configFromPreset = (id: PresetId): Config => {
  const { config } = presetOf(id)
  return structuredClone({ ...config, presetId: id })
}

// Ein Datentyp ist aktiv, wenn er gewaehlt ist und seine Voraussetzung erfuellt ist.
export function isEntityActive(config: Config, key: EntityKey): boolean {
  const entity = entityOf(key)
  if (entity.locked) {
    return true
  }
  return config.entities[key] && (!entity.requires || isEntityActive(config, entity.requires))
}

// Welche Datentypen ein Feld braucht, weil es auf sie verweist.
function targetsOf(input: Input): EntityKey[] {
  switch (input.kind) {
    case 'ref':
    case 'refs':
      return [input.to]
    case 'object':
    case 'rows':
      return input.parts.flatMap((part) => targetsOf(part.input))
    default:
      return []
  }
}

// Verweist ein Teilfeld auf einen abgewaehlten Typ, fehlt nur dieses Teilfeld. Das
// ganze Feld ruht, wenn sein Hauptverweis (der erste) kein Ziel hat.
export function blockingEntity(config: Config, field: Part): EntityKey | null {
  const input = field.input
  let target: EntityKey | undefined
  if (input.kind === 'ref' || input.kind === 'refs') {
    target = input.to
  } else if (input.kind === 'rows') {
    target = targetsOf(input.parts[0].input)[0]
  }
  return target && !isEntityActive(config, target) ? target : null
}

export const isPartUsable = (config: Config, part: Part): boolean => {
  const target = targetsOf(part.input)[0]
  return !target || isEntityActive(config, target)
}

export function isFieldActive(config: Config, entity: EntityKey, field: FieldDef): boolean {
  if (blockingEntity(config, field)) {
    return false
  }
  return Boolean(field.required || config.fields[`${entity}.${field.key}`])
}

// Schaltet einen Baustein. Abhaengige folgen: Ohne Quelle kein Exemplar, ein Exemplar
// braucht seine Quelle.
export function withEntity(config: Config, key: EntityKey, on: boolean): Config {
  const entities = { ...config.entities, [key]: on }
  const follow = (changed: EntityKey) => {
    for (const entity of ENTITIES) {
      if (!on && entity.requires === changed && entities[entity.key]) {
        entities[entity.key] = false
        follow(entity.key)
      }
    }
    const required = entityOf(changed).requires
    if (on && required && !entities[required]) {
      entities[required] = true
      follow(required)
    }
  }
  follow(key)
  return { ...config, entities }
}

export const isSubfieldActive = (config: Config, entity: EntityKey, field: Part, part: Part): boolean =>
  !part.toggle || Boolean(config.fields[`${entity}.${field.key}.${part.key}`])

export interface Stats {
  types: number
  fields: number
  melody: number
}

// Zaehlt die aktiven Felder der aktiven Datentypen.
export function statsOf(config: Config): Stats {
  const stats: Stats = { types: 0, fields: 0, melody: 0 }
  for (const entity of ENTITIES) {
    if (!isEntityActive(config, entity.key)) {
      continue
    }
    stats.types += 1
    for (const field of entity.fields) {
      if (isFieldActive(config, entity.key, field)) {
        stats.fields += 1
        stats.melody += field.origin === 'melody' ? 1 : 0
      }
    }
  }
  return stats
}

// Abweichungen von der gewaehlten Vorlage, ohne die Angaben zum Katalog.
export function changesFromPreset(config: Config): number {
  const preset = presetOf(config.presetId).config
  const keys = new Set([...Object.keys(config.fields), ...Object.keys(preset.fields)])
  let changes = 0
  for (const key of keys) {
    changes += Boolean(config.fields[key]) === Boolean(preset.fields[key]) ? 0 : 1
  }
  for (const key of ENTITY_KEYS) {
    changes += config.entities[key] === preset.entities[key] ? 0 : 1
  }
  changes += config.expressionMode === preset.expressionMode ? 0 : 1
  return changes
}
