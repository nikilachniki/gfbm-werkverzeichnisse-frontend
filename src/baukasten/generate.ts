// Aus Konfiguration und Eingaben entstehen die JSON-LD-Dateien der Vorlage. Hier sitzt
// auch die Verknuepfung von Werk und Expression. Reine Funktionen ohne Oberflaeche, damit
// scripts/check-baukasten.ts sie gegen validate.py und den MeLODy-Export pruefen kann.

import { indexDocument, parseQuery, scoreDocument, type SearchDocument } from '../search/textSearch.ts'
import {
  configFromPreset,
  ENTITIES,
  entityOf,
  isEntityActive,
  isFieldActive,
  isPartUsable,
  isSubfieldActive,
  type Config,
  type EntityDef,
  type EntityKey,
  type FieldDef,
  type Input,
  type Part,
} from './model.ts'
import type { RemoteState } from './github.ts'

export type Values = Record<string, unknown>

export interface ExpressionDraft {
  id: string
  // Leer: folgt dem Werktitel.
  label: string
  values: Values
  // Der Datensatz, wie er in der geoeffneten Datei stand. Siehe preserve().
  original?: Values
}

export interface WorkDraft {
  id: string
  values: Values
  expressions: ExpressionDraft[]
  original?: Values
}

export type PlainEntity = Exclude<EntityKey, 'works' | 'expressions'>

// Bei den uebrigen Typen reist das Original im Datensatz selbst mit.
export const ORIGINAL = '$original'

// Woher ein geoeffnetes Verzeichnis stammt. Damit bleibt beim Speichern alles, was der
// Baukasten nicht anfasst, Byte fuer Byte erhalten.
export interface DataSource {
  name: string
  catalog: Values
  // @context je Datei, etwa "../schema/context.jsonld" oder "../../schema/context.jsonld"
  contexts: Record<string, string>
  // Reihenfolge der IDs je Datei, denn Fassungen etwa stehen nicht zwingend in Werkreihenfolge.
  order: Partial<Record<EntityKey, string[]>>
  // Fassungen, die kein Werk nennt. Sie bleiben unangetastet.
  orphanExpressions: Values[]
  // Die Dateien wie geoeffnet, mit LF-Zeilenenden. Zeigt, was sich geaendert hat.
  files: Record<string, string>
  // Aus dem Daten-Repo geoeffnet: wohin gespeichert wird. Ohne Token, der bleibt in der Sitzung.
  remote?: RemoteState
  // baukasten.json im Datenordner, wie geoeffnet: die gemeinsame Einrichtung des Projekts.
  config?: string
}

export interface Draft {
  works: WorkDraft[]
  records: Record<PlainEntity, Values[]>
  source?: DataSource
}

export const emptyDraft = (): Draft => ({
  works: [],
  records: { manifestations: [], items: [], persons: [], institutions: [], places: [], instrumentations: [], bibliography: [] },
})

const MAX_ID_NAME = 60

export function slug(text: string): string {
  return (
    text
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_ID_NAME)
      .replace(/-+$/, '') || 'neu'
  )
}

// Windows unterscheidet nicht zwischen E-SC und E-Sc, darum ohne Gross- und Kleinschreibung.
export function uniqueId(prefix: string, base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((id) => id.toLowerCase()))
  const name = slug(base)
  let candidate = `${prefix}:${name}`
  for (let counter = 2; used.has(candidate.toLowerCase()); counter += 1) {
    candidate = `${prefix}:${name}-${counter}`
  }
  return candidate
}

const NAME_PARTICLES = new Set(['di', 'de', 'del', 'della', 'du', 'la', 'le', 'van', 'von', 'zu'])

// "Nachname, Vorname" ist eindeutig. Sonst beginnt der Familienname beim ersten
// Namenszusatz, ohne einen solchen beim letzten Wort: "Luise Adolpha Le Beau".
export function splitPersonName(name: string): { familyName: string; givenName?: string } {
  const trimmed = name.trim()
  if (trimmed.includes(',')) {
    const [family, ...given] = trimmed.split(',')
    return { familyName: family.trim(), givenName: given.join(',').trim() || undefined }
  }
  const words = trimmed.split(/\s+/)
  const particle = words.findIndex((word, index) => index > 0 && NAME_PARTICLES.has(word.toLowerCase()))
  const start = particle > 0 ? particle : words.length - 1
  return { familyName: words.slice(start).join(' '), givenName: words.slice(0, start).join(' ') || undefined }
}

// Zu einem eingetippten Namen der Datensatz eines Hilfstyps, mit freier ID.
export function recordFromName(entity: PlainEntity, name: string, taken: string[]): Values {
  const values = valuesFromName(entity, name)
  return { ...values, '@id': uniqueId(entity, entity === 'persons' ? (values.familyName as string) : name, taken) }
}

// Die ID eines neuen Datensatzes: aus der ersten Nummer, sonst aus dem Namen.
export function newRecordId(entity: PlainEntity, values: Values, taken: string[]): string {
  const identifiers = values.identifiers as { value?: string }[] | undefined
  const base = identifiers?.find((identifier) => identifier.value?.trim())?.value || displayName(entity, values) || 'neu'
  return uniqueId(entity, base, taken)
}

function valuesFromName(entity: PlainEntity, name: string): Values {
  switch (entity) {
    case 'persons':
      return { ...splitPersonName(name) }
    case 'institutions':
    case 'places':
      return { name }
    case 'instrumentations':
      return { label: name }
    case 'bibliography':
      return { abbreviation: name }
    case 'items':
      return { label: name }
    case 'manifestations':
      return { titles: [{ text: { '@none': name } }] }
  }
}

function firstTitle(values: Values): string {
  const titles = values.titles as { text?: Record<string, string> }[] | undefined
  return Object.values(titles?.[0]?.text ?? {})[0] ?? ''
}

// Die Nummer in der Liste der Verwaltung: beim Werk die im eigenen Verzeichnis, sonst die
// erste vorhandene, bei der Quelle die Sigle. Andere Datentypen haben keine.
export function recordNumber(entity: EntityKey, record: Values, abbreviation: string): string {
  const identifiers = ((record.identifiers as { list?: string; value?: string }[] | undefined) ?? []).filter((identifier) => identifier.value?.trim())
  if (entity === 'works') {
    const identifier = identifiers.find((candidate) => candidate.list === abbreviation) ?? identifiers[0]
    return identifier ? [identifier.list, identifier.value].filter(Boolean).join(' ') : ''
  }
  return entity === 'manifestations' ? (identifiers.find((identifier) => identifier.list === 'Sigle')?.value ?? '') : ''
}

// Der Name eines Datensatzes in Auswahllisten.
export function displayName(entity: EntityKey, record: Values): string {
  switch (entity) {
    case 'persons':
      return [record.givenName, record.familyName].filter(Boolean).join(' ')
    case 'institutions':
    case 'places':
      return (record.name as string) ?? ''
    case 'instrumentations':
    case 'items':
    case 'expressions':
      return (record.label as string) || (record.shelfmark as string) || ''
    case 'bibliography':
      return (record.abbreviation as string) ?? ''
    default:
      return firstTitle(record)
  }
}

// Sprachkuerzel fuer Titel. Fuer en gibt es noch keinen Begriff in der Auswahl.
export const TITLE_LANGUAGES = ['la', 'it', 'fr', 'de', 'en']

const LANGUAGE_TERMS: Record<string, string> = {
  la: 'terms:Latin',
  it: 'terms:Italian',
  fr: 'terms:French',
  de: 'terms:German',
}

const escapeHtml = (text: string) => text.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;')

// Bringt eine Eingabe in die Form des Schemas. Leeres entfaellt.
function clean(config: Config, input: Input, value: unknown, entity?: EntityKey, field?: Part): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  switch (input.kind) {
    case 'text': {
      const text = String(value).trim()
      if (!text) {
        return undefined
      }
      // Die Anzeige erkennt vorgeschlagene Namen nur in genau dieser Schreibweise.
      const suggested = input.suggest?.find((name) => name.toLowerCase() === text.toLowerCase())
      return suggested ?? (input.html ? escapeHtml(text) : text)
    }
    case 'number': {
      const number = Number(value)
      return Number.isInteger(number) && number >= 1 ? number : undefined
    }
    case 'date':
    case 'link':
    case 'select':
    case 'piece':
    case 'ref':
      return String(value).trim() || undefined
    case 'strings':
    case 'terms':
    case 'links':
    case 'refs': {
      const list = (value as string[]).map((entry) => entry.trim()).filter(Boolean)
      return list.length > 0 ? list : undefined
    }
    case 'langText': {
      const entries = Object.entries(value as Record<string, string>).filter(([, text]) => text.trim())
      return entries.length > 0 ? Object.fromEntries(entries.map(([lang, text]) => [lang, text.trim()])) : undefined
    }
    case 'titles': {
      const rows = (value as { text?: Record<string, string> }[])
        .map((row) => clean(config, { kind: 'langText' }, row.text))
        .filter(Boolean)
        .slice(0, input.max)
        .map((text, index) =>
          input.typed ? { text, type: index === 0 ? 'terms:MainTitle' : 'terms:OtherTitle' } : { text },
        )
      return rows.length > 0 ? rows : undefined
    }
    case 'object':
      return cleanParts(config, input.parts, value as Values, entity, field)
    case 'rows': {
      const rows = (value as Values[])
        .map((row) => cleanParts(config, input.parts, row, entity, field))
        .filter((row): row is Values => row !== undefined && isCompleteRow(input, row))
      if (input.indexKey) {
        rows.forEach((row, index) => {
          row[input.indexKey!] = index + 1
        })
      }
      return rows.length > 0 ? rows : undefined
    }
    case 'auto':
      return undefined
  }
}

function cleanParts(config: Config, parts: Part[], value: Values, entity?: EntityKey, field?: Part): Values | undefined {
  const result: Values = {}
  for (const part of parts) {
    if (!isPartUsable(config, part) || (entity && field && !isSubfieldActive(config, entity, field, part))) {
      continue
    }
    const cleaned = clean(config, part.input, value[part.key], entity, field)
    if (cleaned !== undefined) {
      result[part.key] = cleaned
    }
  }
  // Was das Formular nicht kennt, etwa die Art eines Besetzungsglieds, bleibt erhalten.
  const known = new Set(parts.map((part) => part.key))
  for (const [key, other] of Object.entries(value)) {
    if (!known.has(key)) {
      result[key] = other
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// Zeilen, denen ein Pflichtteil des Schemas fehlt, kommen nicht in die Datei.
function isCompleteRow(input: Extract<Input, { kind: 'rows' }>, row: Values): boolean {
  const keys = input.parts.map((part) => part.key)
  if (keys.includes('embodies')) {
    return Boolean(row.embodies || row.titleInSource)
  }
  if (keys.includes('agent')) {
    return Boolean(row.agent && row.role)
  }
  if (keys.includes('list')) {
    return Boolean(row.list && row.value)
  }
  if (keys.includes('inBibliography')) {
    return Boolean(row.inBibliography)
  }
  if (keys.includes('html')) {
    return Boolean(row.html)
  }
  if (input.indexKey) {
    return Boolean(row.description)
  }
  return true
}

function cleanRecord(config: Config, entity: EntityDef, id: string, values: Values): Values {
  const record: Values = { '@id': id, '@type': entity.type }
  for (const field of entity.fields) {
    if (!isFieldActive(config, entity.key, field)) {
      continue
    }
    const cleaned = clean(config, field.input, values[field.key], entity.key, field)
    if (cleaned !== undefined) {
      record[field.key] = cleaned
    }
  }
  return record
}

function composerRecord(config: Config): Values | null {
  const name = config.catalogue.composer.trim()
  if (!name || !isEntityActive(config, 'persons')) {
    return null
  }
  const person = splitPersonName(name)
  return { '@id': `persons:${slug(person.familyName).toLowerCase()}`, ...person }
}

const workIdBase = (values: Values): string => {
  const identifiers = values.identifiers as { value?: string }[] | undefined
  return identifiers?.find((identifier) => identifier.value?.trim())?.value ?? firstTitle(values)
}

// Vergibt beim Speichern die IDs eines Werks und seiner Expressions. Eine ID bleibt danach
// fest (docs/modell.md). Die erste Expression traegt denselben Namen wie das Werk.
export function assignWorkIds(work: WorkDraft, existing: WorkDraft[]): WorkDraft {
  const others = existing.filter((other) => other !== work && other.id !== work.id)
  const id = work.id || uniqueId('works', workIdBase(work.values), others.map((other) => other.id))
  const name = id.slice('works:'.length)
  const taken = others.flatMap((other) => other.expressions.map((expression) => expression.id))
  const expressions: ExpressionDraft[] = []
  for (const expression of work.expressions) {
    const siblings = expressions.map((other) => other.id)
    const fixed = work.expressions.filter((other) => other.id).map((other) => other.id)
    const suffix = expression.label.trim() ? slug(expression.label) : String(expressions.length + 1)
    const base = expressions.length === 0 ? name : `${name}-${suffix}`
    expressions.push({
      ...expression,
      id: expression.id || uniqueId('expressions', base, [...taken, ...siblings, ...fixed]),
    })
  }
  return { ...work, id, expressions }
}

export const newExpression = (): ExpressionDraft => ({ id: '', label: '', values: {} })

// Beim Anlegen eines Werks: Gekoppelt und mit erster Fassung entsteht sofort eine
// Expression, im manuellen Modus nicht.
export function newWork(config: Config): WorkDraft {
  const list = config.catalogue.abbreviation.trim()
  return {
    id: '',
    values: {
      titles: [{ text: { '@none': '' } }],
      ...(list ? { identifiers: [{ list, value: '' }] } : {}),
    },
    expressions: config.expressionMode === 'manual' ? [] : [newExpression()],
  }
}

export interface BuiltFiles {
  catalog: Values
  collections: Record<EntityKey, Values[]>
}

const MAIN_LANGUAGE_NONE = '@none'

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// Die Felder, die das Formular gerade verwaltet. Alles andere bleibt, wie es war.
const ownedKeys = (config: Config, entity: EntityDef): Set<string> =>
  new Set(entity.fields.filter((field) => isFieldActive(config, entity.key, field)).map((field) => field.key))

// Verbindet einen geoeffneten Datensatz mit dem, was das Formular daraus macht. Ein Feld
// wechselt nur, wenn es im Formular veraendert wurde; unbekannte, abgewaehlte und
// unveraenderte Felder bleiben wortgleich und an ihrer Stelle. derived: Felder, die der
// Baukasten selbst setzt; true heisst, der Wert aus fresh gilt, false das Original.
function preserve(original: Values | undefined, edited: Values, fresh: Values, owned: Set<string>, derived: Record<string, boolean> = {}): Values {
  if (!original) {
    return fresh
  }
  const result: Values = {}
  const keys = [...Object.keys(original), ...Object.keys(fresh).filter((key) => !(key in original))]
  for (const key of keys) {
    let value: unknown
    if (key === '@id' || key === '@type') {
      value = original[key]
    } else if (key in derived) {
      value = derived[key] ? fresh[key] : original[key]
    } else if (!owned.has(key) || sameJson(edited[key], original[key])) {
      value = original[key]
    } else {
      value = fresh[key]
    }
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

// Geoeffnete Datensaetze behalten ihren Platz in der Datei, neue kommen ans Ende.
function inSourceOrder(records: Values[], order: string[] | undefined): Values[] {
  if (!order) {
    return records
  }
  const position = new Map(order.map((id, index) => [id, index]))
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => (position.get(a.record['@id'] as string) ?? order.length + a.index) - (position.get(b.record['@id'] as string) ?? order.length + b.index))
    .map(({ record }) => record)
}

// Baut die Datensaetze aller Typen. Nur hier kennt das Ergebnis die Kopplung.
export function buildCollections(config: Config, draft: Draft): BuiltFiles {
  const works = entityOf('works')
  const expressions = entityOf('expressions')
  const source = draft.source
  // Ein geoeffnetes Verzeichnis nennt seine Komponist*in selbst; der Name im Baukasten
  // erzeugt dann keinen zweiten Datensatz. Nur ein frisches Verzeichnis ohne Angabe
  // bekommt sie aus dem Baukasten.
  const composer = source?.catalog.composer ? null : composerRecord(config)
  const composerId = (source?.catalog.composer as string | undefined) ?? (composer?.['@id'] as string | undefined)
  const contributorsField = works.fields.find((field) => field.key === 'contributors') as FieldDef
  const contributorsOn = isFieldActive(config, 'works', contributorsField)
  const firstExpressionOf = new Map(draft.works.map((work) => [work.id, work.expressions[0]?.id]))
  const collections = Object.fromEntries(ENTITIES.map(({ key }) => [key, [] as Values[]])) as Record<EntityKey, Values[]>
  const languageField = expressions.fields.find((field) => field.key === 'languages') as FieldDef
  const ownedWork = ownedKeys(config, works)
  const ownedExpression = ownedKeys(config, expressions)
  const emitted = new Set<string>()

  for (const work of draft.works) {
    const fresh = cleanRecord(config, works, work.id, work.values)
    // Die Komponist*in des Verzeichnisses steht bei neuen Werken zuerst.
    if (!work.original && composerId && contributorsOn && isEntityActive(config, 'persons')) {
      const others = ((fresh.contributors as Values[]) ?? []).filter((row) => row.agent !== composerId)
      fresh.contributors = [{ agent: composerId, role: 'terms:Composer' }, ...others]
    }
    if (work.expressions.length > 0) {
      fresh.realisedIn = work.expressions.map((expression) => expression.id)
    }
    const record = preserve(work.original, work.values, fresh, ownedWork, { realisedIn: true })
    collections.works.push(record)

    const title = firstTitle(record)
    const language = Object.keys((record.titles as { text: Values }[] | undefined)?.[0]?.text ?? {})[0]
    const partUnchanged = Boolean(work.original) && sameJson(work.values.partOfWork, work.original?.partOfWork)
    work.expressions.forEach((expression, position) => {
      // Eine Fassung, die zwei Werke nennen, steht nur einmal in der Datei.
      if (emitted.has(expression.id)) {
        return
      }
      emitted.add(expression.id)
      const expressionRecord = cleanRecord(config, expressions, expression.id, expression.values)
      const label = expression.label.trim() || (position === 0 ? title : `${title} (Fassung ${position + 1})`)
      const { '@id': id, '@type': type, ...rest } = expressionRecord
      const fresh: Values = { '@id': id, '@type': type, label: label || '(ohne Titel)', ...rest }
      // Die Sprache des Titels gilt auch fuer neue Fassungen, solange nichts anderes dasteht.
      if (!expression.original && isFieldActive(config, 'expressions', languageField) && !fresh.languages && LANGUAGE_TERMS[language]) {
        fresh.languages = [LANGUAGE_TERMS[language]]
      }
      // Der Werkteil spiegelt sich auf die erste Fassung, sobald "Teil von" am Werk an ist.
      const parent = record.partOfWork as string | undefined
      if (position === 0 && parent) {
        const target = firstExpressionOf.get(parent)
        if (target) {
          fresh.partOfExpression = target
        }
      }
      collections.expressions.push(
        preserve(expression.original, expression.values, fresh, ownedExpression, { label: true, partOfExpression: !(expression.original && partUnchanged) }),
      )
    })
  }
  collections.expressions.push(...(source?.orphanExpressions ?? []))

  for (const entity of ENTITIES) {
    if (entity.key === 'works' || entity.key === 'expressions') {
      continue
    }
    const active = isEntityActive(config, entity.key)
    const owned = ownedKeys(config, entity)
    for (const values of draft.records[entity.key]) {
      const original = values[ORIGINAL] as Values | undefined
      // Ein abgewaehlter Typ verschwindet nicht aus einem geoeffneten Verzeichnis.
      if (!active) {
        if (original) {
          collections[entity.key].push(original)
        }
        continue
      }
      let fresh = cleanRecord(config, entity, values['@id'] as string, values)
      if (entity.key === 'items' && !fresh.label) {
        const { '@id': id, '@type': type, ...rest } = fresh
        fresh = { '@id': id, '@type': type, label: (fresh.shelfmark as string) || (id as string).slice('items:'.length), ...rest }
      }
      collections[entity.key].push(preserve(original, values, fresh, owned))
    }
  }

  if (source) {
    for (const entity of ENTITIES) {
      collections[entity.key] = inSourceOrder(collections[entity.key], source.order[entity.key])
    }
  }

  if (composer && !collections.persons.some((person) => person['@id'] === composer['@id'])) {
    collections.persons.unshift({ '@id': composer['@id'], '@type': 'Person', familyName: composer.familyName, ...(composer.givenName ? { givenName: composer.givenName } : {}) })
  }

  const label = config.catalogue.label.trim()
  const abbreviation = config.catalogue.abbreviation.trim()
  const catalog: Values = source
    ? {
        ...source.catalog,
        ...(label ? { label } : {}),
        ...(abbreviation ? { catalogueAbbreviation: abbreviation } : {}),
        ...(composer ? { composer: composer['@id'] } : {}),
      }
    : {
        '@context': DEFAULT_CONTEXT,
        '@id': 'urn:uuid:dataCatalogs/catalog',
        '@type': 'Catalogue',
        label: label || 'Name des Werkverzeichnisses',
        ...(composer ? { composer: composer['@id'] } : {}),
        catalogueAbbreviation: abbreviation || 'WV',
      }
  // Ein geleertes Feld entfernt den Text, ein nie angefasstes laesst ihn stehen.
  const description = config.catalogue.description?.trim()
  if (description) {
    catalog.description = description
  } else if (description !== undefined) {
    delete catalog.description
  }
  return { catalog, collections }
}

const DEFAULT_CONTEXT = '../schema/context.jsonld'

const fileContent = (records: Values[], context = DEFAULT_CONTEXT): string =>
  `${JSON.stringify({ '@context': context, entries: records }, null, 2)}\n`

// Alle Dateien eines data/-Ordners: auch leere, denn validate.py und die Oberflaeche
// lesen immer alle. Die Schreibweise entspricht den Dateien der Vorlage, so dass ein
// unveraendertes Verzeichnis Byte fuer Byte gleich bleibt.
export function buildFiles(config: Config, draft: Draft): Record<string, string> {
  const { catalog, collections } = buildCollections(config, draft)
  const files: Record<string, string> = { 'catalog.json': `${JSON.stringify(catalog, null, 2)}\n` }
  for (const entity of ENTITIES) {
    files[entity.file] = fileContent(collections[entity.key], draft.source?.contexts[entity.file])
  }
  return files
}

export const CONFIG_FILE = 'baukasten.json'
export const configText = (config: Config): string => `${JSON.stringify(config, null, 2)}\n`

// Die Dateien, die sich gegenueber dem geoeffneten Verzeichnis geaendert haben. Bei einem
// Verzeichnis aus dem Repo zaehlt auch die Einrichtung (baukasten.json) dazu.
export function changedFiles(config: Config, draft: Draft): string[] {
  if (!draft.source) {
    return []
  }
  const files = buildFiles(config, draft)
  const changed = Object.keys(files).filter((name) => files[name] !== draft.source!.files[name])
  if (draft.source.remote && configText(config) !== draft.source.config) {
    changed.push(CONFIG_FILE)
  }
  return changed
}

// Die Einrichtung aus baukasten.json; fehlende Angaben kommen aus der Vorlage.
export function configFromText(text: string): Config {
  const stored = JSON.parse(text) as Partial<Config>
  const base = configFromPreset(stored.presetId && ['lasso', 'lebeau', 'blank'].includes(stored.presetId) ? stored.presetId : 'blank')
  return {
    ...base,
    ...stored,
    catalogue: { ...base.catalogue, ...stored.catalogue },
    entities: { ...base.entities, ...stored.entities },
    fields: { ...stored.fields },
    expressionMode: stored.expressionMode === 'manual' ? 'manual' : 'auto',
  } as Config
}

export const DATA_FILES = ['catalog.json', ...ENTITIES.map((entity) => entity.file)]

// Liest einen data/-Ordner ein. Jeder Datensatz behaelt sein Original, siehe preserve().
// files: Dateiname -> Inhalt; Zeilenenden duerfen CRLF sein (Windows-Arbeitskopie).
export function draftFromFiles(files: Record<string, string>, name: string, remote?: RemoteState, config?: string): Draft {
  const normalized = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, text.replace(/\r\n/g, '\n')]))
  const missing = DATA_FILES.filter((file) => !(file in normalized))
  if (missing.length > 0) {
    throw new Error(`Es fehlen Dateien: ${missing.join(', ')}`)
  }
  const parsed: Record<string, Values> = {}
  for (const file of DATA_FILES) {
    try {
      parsed[file] = JSON.parse(normalized[file]) as Values
    } catch (error) {
      throw new Error(`${file} ist kein gültiges JSON: ${(error as Error).message}`)
    }
  }
  const entriesOf = (entity: EntityKey) => (parsed[entityOf(entity).file].entries as Values[] | undefined) ?? []
  const strip = (record: Values, ...keys: string[]) => Object.fromEntries(Object.entries(record).filter(([key]) => !['@id', '@type', ...keys].includes(key)))

  const expressionsById = new Map(entriesOf('expressions').map((record) => [record['@id'] as string, record]))
  const claimed = new Set<string>()
  const works: WorkDraft[] = entriesOf('works').map((record) => {
    const title = firstTitle(record)
    const expressions: ExpressionDraft[] = []
    for (const id of (record.realisedIn as string[] | undefined) ?? []) {
      const expression = expressionsById.get(id)
      if (!expression) {
        // Ein Verweis ins Leere bleibt im Werk stehen; die Pruefung meldet ihn.
        continue
      }
      claimed.add(id)
      const position = expressions.length
      const label = (expression.label as string | undefined) ?? ''
      const followsTitle = label === (position === 0 ? title : `${title} (Fassung ${position + 1})`)
      expressions.push({ id, label: followsTitle ? '' : label, values: strip(expression, 'label'), original: expression })
    }
    return { id: record['@id'] as string, values: strip(record), expressions, original: record }
  })

  const draft = emptyDraft()
  draft.works = works
  for (const entity of ENTITIES) {
    if (entity.key !== 'works' && entity.key !== 'expressions') {
      draft.records[entity.key] = entriesOf(entity.key).map((record) => ({ ...record, [ORIGINAL]: record }))
    }
  }
  draft.source = {
    name,
    catalog: parsed['catalog.json'],
    contexts: Object.fromEntries(ENTITIES.map((entity) => [entity.file, (parsed[entity.file]['@context'] as string) ?? DEFAULT_CONTEXT])),
    order: Object.fromEntries(ENTITIES.map((entity) => [entity.key, entriesOf(entity.key).map((record) => record['@id'] as string)])),
    orphanExpressions: entriesOf('expressions').filter((record) => !claimed.has(record['@id'] as string)),
    files: Object.fromEntries(DATA_FILES.map((file) => [file, normalized[file]])),
    ...(remote ? { remote } : {}),
    ...(config !== undefined ? { config } : {}),
  }
  return draft
}

// Damit ein geoeffnetes Verzeichnis im Formular vollstaendig sichtbar ist: alle Typen und
// Felder, in denen etwas steht, werden eingeschaltet, und die Angaben zum Katalog uebernommen.
export function configForDraft(config: Config, draft: Draft): Config {
  if (!draft.source) {
    return config
  }
  const next = structuredClone(config)
  const catalog = draft.source.catalog
  const composer = draft.records.persons.find((person) => person['@id'] === catalog.composer)
  next.catalogue = {
    label: (catalog.label as string) ?? '',
    abbreviation: (catalog.catalogueAbbreviation as string) ?? '',
    composer: composer ? [composer.familyName, composer.givenName].filter(Boolean).join(', ') : '',
    description: (catalog.description as string) ?? '',
  }
  const usage = usageOf(draft)
  for (const entity of ENTITIES) {
    if (usage.entities[entity.key] > 0) {
      next.entities[entity.key] = true
      if (entity.requires) {
        next.entities[entity.requires] = true
      }
    }
  }
  for (const key of Object.keys(usage.fields)) {
    next.fields[key] = true
  }
  return next
}

// Was im Verzeichnis schon Daten enthaelt, jeweils mit der Zahl der Datensaetze.
// Schluessel der Felder wie in Config.fields: "works.genres", "manifestations.contents.voices".
export interface Usage {
  entities: Record<EntityKey, number>
  fields: Record<string, number>
}

export function usageOf(draft: Draft): Usage {
  const recordsOf = (entity: EntityKey): Values[] =>
    entity === 'works'
      ? draft.works.map((work) => work.values)
      : entity === 'expressions'
        ? draft.works.flatMap((work) => work.expressions.map((expression) => expression.values))
        : draft.records[entity]
  const usage: Usage = { entities: {} as Usage['entities'], fields: {} }
  for (const entity of ENTITIES) {
    const records = recordsOf(entity.key)
    usage.entities[entity.key] = records.length
    for (const field of entity.fields) {
      const used = records.filter((record) => record[field.key] !== undefined)
      if (used.length === 0) {
        continue
      }
      usage.fields[`${entity.key}.${field.key}`] = used.length
      if (field.input.kind === 'rows' || field.input.kind === 'object') {
        for (const part of field.input.parts.filter((candidate) => candidate.toggle)) {
          const rowsOf = (record: Values) => (Array.isArray(record[field.key]) ? (record[field.key] as Values[]) : [record[field.key] as Values])
          const withPart = used.filter((record) => rowsOf(record).some((row) => row?.[part.key] !== undefined))
          if (withPart.length > 0) {
            usage.fields[`${entity.key}.${field.key}.${part.key}`] = withPart.length
          }
        }
      }
    }
  }
  return usage
}

// Wie viele Datensaetze das Abschalten eines Bausteins treffen wuerde, abhaengige eingerechnet.
export const entityUse = (usage: Usage, key: EntityKey): number =>
  usage.entities[key] + ENTITIES.filter((entity) => entity.requires === key).reduce((sum, entity) => sum + entityUse(usage, entity.key), 0)

// Was das Abschliessen der Einrichtung schreibt: baukasten.json und nur die Dateien, die
// sich durch Name, Kuerzel, Komponist*in oder Info-Text aendern. Eintraege vom Ausprobieren gehoeren
// nicht dazu. Was im Repo schon Daten enthaelt, bleibt in der Einrichtung eingeschaltet.
export function setupFiles(wizard: Config, files: Record<string, string>, remote: RemoteState): Record<string, string> {
  const draft = draftFromFiles(files, 'Einrichtung', remote)
  const config = { ...configForDraft(wizard, draft), catalogue: wizard.catalogue }
  const built: Record<string, string> = { ...buildFiles(config, draft), [CONFIG_FILE]: configText(config) }
  return Object.fromEntries(changedFiles(config, draft).map((file) => [file, built[file]]))
}

export interface Check {
  level: 'error' | 'info'
  text: string
  // Der Fehler laesst sich mit einem Klick beheben.
  fix?: 'createExpressions'
  // Was im Einzelnen dahintersteht, fuer die ausfuehrliche Ansicht
  details?: string[]
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const LINK = /^https?:\/\/[^\s/<>"{}|\\^`[\]]+\/[^\s<>"{}|\\^`[\]]+$/
const REFERENCE = /^(works|expressions|manifestations|items|persons|institutions|places|instrumentations|bibliography):[A-Za-z0-9-]+$/

function collectValues(input: Input, value: unknown, visit: (input: Input, value: string) => void): void {
  if (value === undefined || value === null) {
    return
  }
  switch (input.kind) {
    case 'date':
    case 'link':
    case 'ref':
    case 'piece':
      visit(input, value as string)
      break
    case 'links':
    case 'refs':
      for (const entry of value as string[]) {
        visit(input, entry)
      }
      break
    case 'object':
      for (const part of input.parts) {
        collectValues(part.input, (value as Values)[part.key], visit)
      }
      break
    case 'rows':
      for (const row of value as Values[]) {
        for (const part of input.parts) {
          collectValues(part.input, row[part.key], visit)
        }
      }
      break
    default:
      break
  }
}

// Was validate.py beanstanden wuerde, sagt der Baukasten schon vorher. Dazu zwei
// Hinweise auf bekannte Grenzen des MeLODy-Exports.
export function runChecks(config: Config, draft: Draft): Check[] {
  const { collections } = buildCollections(config, draft)
  const checks: Check[] = []

  const withoutExpression = draft.works.filter((work) => work.expressions.length === 0)
  if (withoutExpression.length > 0) {
    checks.push({
      level: 'error',
      text: `${withoutExpression.length} Werk(e) ohne Fassung. Das verletzt FRBR, und keine Quelle kann darauf verweisen.`,
      fix: 'createExpressions',
    })
  }

  const known = new Set<string>()
  const seen = new Set<string>()
  for (const entity of ENTITIES) {
    for (const record of collections[entity.key]) {
      const id = record['@id'] as string
      if (seen.has(id.toLowerCase())) {
        checks.push({ level: 'error', text: `ID doppelt vergeben: ${id}` })
      }
      seen.add(id.toLowerCase())
      known.add(id)
    }
  }

  const textOnly = new Map<string, number>()
  const withoutLanguage: string[] = []
  for (const entity of ENTITIES) {
    for (const record of collections[entity.key]) {
      const id = record['@id'] as string
      for (const field of entity.fields) {
        const value = record[field.key]
        if (value === undefined) {
          continue
        }
        if (field.origin === 'wv') {
          const name = `${entity.plural}: ${field.label}`
          textOnly.set(name, (textOnly.get(name) ?? 0) + 1)
        }
        collectValues(field.input, value, (input, entry) => {
          if (input.kind === 'date' && !ISO_DATE.test(entry)) {
            checks.push({ level: 'error', text: `${id}: Datum „${entry}“ hat nicht die Form JJJJ-MM-TT.` })
          } else if ((input.kind === 'link' || input.kind === 'links') && !LINK.test(entry)) {
            checks.push({ level: 'error', text: `${id}: „${entry}“ ist kein vollständiger Link.` })
          } else if ((input.kind === 'ref' || input.kind === 'refs' || input.kind === 'piece') && (!REFERENCE.test(entry) || !known.has(entry))) {
            checks.push({ level: 'error', text: `${id}: Verweis ohne Ziel: ${entry}` })
          }
        })
      }
      if ((entity.key === 'works' || entity.key === 'expressions') && (record.titles as { text: Values }[] | undefined)?.some((title) => MAIN_LANGUAGE_NONE in title.text)) {
        withoutLanguage.push(id)
      }
    }
  }

  for (const item of collections.items) {
    if (!item.exemplifies) {
      checks.push({ level: 'error', text: `${item['@id'] as string}: Exemplar braucht eine Quelle.` })
    }
  }
  for (const work of collections.works) {
    if (!(work.titles as unknown[] | undefined)?.length) {
      checks.push({ level: 'error', text: `${work['@id'] as string}: Werk braucht einen Titel.` })
    }
  }

  if (withoutLanguage.length > 0) {
    checks.push({ level: 'info', text: `${withoutLanguage.length} Titel ohne Sprache: im MeLODy-Editor nicht speichern, das Formular schreibt dafür ungültiges Turtle.`, details: withoutLanguage })
  }
  if (textOnly.size > 0) {
    const total = [...textOnly.values()].reduce((sum, count) => sum + count, 0)
    const details = [...textOnly].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}: ${count}`)
    checks.push({ level: 'info', text: `${total} Angaben stehen in Erweiterungsfeldern und werden beim MeLODy-Export zu Text.`, details })
  }
  return checks
}

// Welche Pflichtangaben einem Datensatz noch fehlen. Abgeleitete Felder zaehlen nicht.
export function missingRequired(config: Config, entity: EntityDef, values: Values): string[] {
  return entity.fields
    .filter((field) => field.required && !field.derived && field.input.kind !== 'auto')
    .filter((field) => clean(config, field.input, values[field.key]) === undefined)
    .map((field) => field.label)
}

// Felder mit Zeilen, die beim Speichern wegfielen, obwohl etwas eingetragen ist. Eine
// Zeile, in der nur die Vorbelegung steht, gilt als leer.
export function incompleteRows(config: Config, entity: EntityDef, values: Values): string[] {
  return entity.fields
    .filter((field) => {
      const input = field.input
      if (input.kind !== 'rows' || !isFieldActive(config, entity.key, field)) {
        return false
      }
      return ((values[field.key] as Values[] | undefined) ?? []).some((row) => {
        const cleaned = cleanParts(config, input.parts, row, entity.key, field)
        return cleaned !== undefined && !isCompleteRow(input, cleaned) && Object.keys(cleaned).some((key) => cleaned[key] !== input.defaults?.[key])
      })
    })
    .map((field) => field.label)
}

export const isManuscript = (source: Values): boolean => ((source.classifications as string[] | undefined) ?? []).includes('terms:Manuscript')

export const itemsOfSource = (draft: Draft, sourceId: string): Values[] => draft.records.items.filter((item) => item.exemplifies === sourceId)

// Legt das Exemplar einer Quelle an oder schreibt ein vorhandenes fort. Eine Handschrift
// gibt es nur einmal, deshalb entsteht ihr Exemplar zusammen mit ihr.
export function withSourceItem(draft: Draft, sourceId: string, item: Values): Draft {
  const list = draft.records.items
  const id = (item['@id'] as string | undefined) ?? uniqueId('items', sourceId.slice('manifestations:'.length), list.map((other) => other['@id'] as string))
  const record = { ...item, '@id': id, exemplifies: sourceId }
  const items = list.some((other) => other['@id'] === id) ? list.map((other) => (other['@id'] === id ? record : other)) : [...list, record]
  return { ...draft, records: { ...draft.records, items } }
}

// Was die Listen der Verwaltung durchsuchen: alles, woran man einen Datensatz erkennt.
const SEARCH_KEYS = ['titles', 'identifiers', 'label', 'name', 'familyName', 'givenName', 'alternateNames', 'abbreviation', 'shelfmark', 'formerShelfmark', 'sourceType']

function textsIn(value: unknown): string[] {
  if (typeof value === 'number') {
    return [String(value)]
  }
  if (typeof value === 'string') {
    return value.startsWith('terms:') ? [] : [value]
  }
  return value && typeof value === 'object' ? Object.values(value).flatMap(textsIn) : []
}

export function recordSearchIndex(entity: EntityKey, id: string, values: Values): SearchDocument {
  return indexDocument([
    { text: displayName(entity, values), weight: 3 },
    { text: SEARCH_KEYS.flatMap((key) => textsIn(values[key])).join(' '), weight: 2 },
    { text: id },
  ])
}

// Die Treffer, beste zuerst; ohne Suchwort alles in der gewohnten Reihenfolge.
export function searchEntries<T extends { document: SearchDocument }>(entries: T[], text: string): T[] {
  const query = parseQuery(text)
  if (!query) {
    return entries
  }
  return entries
    .map((entry) => ({ entry, score: scoreDocument(entry.document, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

export interface RecordChanges {
  label: string
  added: number
  changed: number
  removed: number
}

// Die geoeffneten Datensaetze als Text, je Quelle nur einmal geparst.
const openedRecords = new WeakMap<object, Map<string, Map<string, string>>>()

function recordsOpened(source: NonNullable<Draft['source']>): Map<string, Map<string, string>> {
  let opened = openedRecords.get(source)
  if (!opened) {
    opened = new Map()
    for (const entity of ENTITIES) {
      const entries = (JSON.parse(source.files[entity.file]) as { entries?: Values[] }).entries ?? []
      opened.set(entity.key, new Map(entries.map((record) => [record['@id'] as string, JSON.stringify(record)])))
    }
    openedRecords.set(source, opened)
  }
  return opened
}

// Was gegenueber dem zuletzt geoeffneten oder gespeicherten Stand anders ist, je Datentyp.
export function changedRecords(config: Config, draft: Draft): RecordChanges[] {
  const source = draft.source
  if (!source) {
    return []
  }
  const { catalog, collections } = buildCollections(config, draft)
  const opened = recordsOpened(source)
  const result: RecordChanges[] = []
  for (const entity of ENTITIES) {
    const before = opened.get(entity.key)!
    let added = 0
    let changed = 0
    let kept = 0
    for (const record of collections[entity.key]) {
      const old = before.get(record['@id'] as string)
      if (old === undefined) {
        added += 1
      } else {
        kept += 1
        changed += old === JSON.stringify(record) ? 0 : 1
      }
    }
    const removed = before.size - kept
    if (added + changed + removed > 0) {
      result.push({ label: entity.plural, added, changed, removed })
    }
  }
  const catalogChanged = `${JSON.stringify(catalog, null, 2)}\n` !== source.files['catalog.json']
  if (catalogChanged || (source.remote && configText(config) !== source.config)) {
    result.push({ label: 'Einstellungen', added: 0, changed: 1, removed: 0 })
  }
  return result
}

// Das Ein-Klick-Heilmittel: Jedes Werk ohne Expression bekommt eine.
export function createMissingExpressions(draft: Draft): Draft {
  return {
    ...draft,
    works: draft.works.map((work) => (work.expressions.length > 0 ? work : assignWorkIds({ ...work, expressions: [newExpression()] }, draft.works))),
  }
}

// Beispiel zum Ausprobieren. Bei Lasso ein echter Auszug (LV 90), bei Le Beau nur
// veroeffentlichte Eckdaten, keine erfundene Quelle.
export function sampleDraft(config: Config): Draft {
  const draft = emptyDraft()
  if (config.presetId === 'lasso') {
    draft.records.persons.push({ '@id': 'persons:marot', familyName: 'Marot', givenName: 'Clément', sameAs: ['https://d-nb.info/gnd/118731122'] })
    draft.records.places.push({ '@id': 'places:loewen', name: 'Löwen' })
    draft.works.push({
      id: 'works:90',
      values: {
        titles: [{ text: { fr: 'Elle s’en va' } }, { text: { fr: 'Elle s’en va de moy' } }],
        identifiers: [{ list: 'LV', value: '90' }],
        contributors: [{ agent: 'persons:marot', role: 'terms:Lyricist' }],
      },
      expressions: [{ id: 'expressions:90', label: '', values: {} }],
    })
    draft.records.manifestations.push({
      '@id': 'manifestations:1560-4',
      titles: [{ text: { '@none': 'Tiers livre des chansons a quatre, cincq et six parties' } }],
      classifications: ['terms:Print'],
      identifiers: [{ list: 'Sigle', value: '1560-4' }],
      contents: [{ embodies: 'expressions:90', position: '12', titleInSource: "Elle s'en va", voices: 5 }],
      partbooks: 'Superius; Contratenor; Tenor; Bassus; Quinta et Sexta Pars',
      publication: { startDate: '1560-01-01', endDate: '1560-12-31', place: 'places:loewen', publisherName: 'Pierre Phalèse' },
    })
  } else if (config.presetId === 'lebeau') {
    draft.records.instrumentations.push({ '@id': 'instrumentations:vc-klav', label: 'Violoncello und Klavier', details: [{ description: 'Violoncello', quantity: 1 }, { description: 'Klavier', quantity: 1 }] })
    draft.works.push({
      id: 'works:op-17',
      values: {
        titles: [{ text: { de: 'Sonate für Violoncello und Klavier' } }],
        identifiers: [{ list: 'op.', value: '17' }],
        genres: ['Sonate'],
      },
      expressions: [{ id: 'expressions:op-17', label: '', values: { instrumentation: 'instrumentations:vc-klav', key: { description: 'D-Dur' } } }],
    })
  }
  return draft
}
