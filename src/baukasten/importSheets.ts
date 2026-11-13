// Batch-Import aus einer Tabelle: welche Spalten die Vorlage hat und wie aus ihren Zeilen
// Datensaetze werden. Reine Funktionen ohne Excel; die Datei selbst liest und schreibt excel.ts.
//
// Jedes Blatt steht fuer einen Datentyp, jede Zeile fuer einen neuen Datensatz. Felder mit
// mehreren Eintraegen (Beteiligte, enthaltene Stuecke ...) bekommen weitere Eintraege in den
// Zeilen darunter, in denen dann nur deren Spalten gefuellt sind. Einfache Listen werden mit
// Semikolon getrennt.

import {
  assignWorkIds,
  displayName,
  incompleteRows,
  isManuscript,
  itemsOfSource,
  missingRequired,
  recordFromName,
  uniqueId,
  withSourceItem,
  type Draft,
  type PlainEntity,
  type Values,
  type WorkDraft,
} from './generate.ts'
import { ENTITIES, entityOf, isEntityActive, isFieldActive, isPartUsable, isSubfieldActive, type Config, type EntityKey, type FieldDef, type Input, type Part } from './model.ts'

export type Cell = string | number | Date | null

export interface SheetInput {
  name: string
  // Die erste Zeile traegt die Spaltennamen. number: Zeilennummer in der Datei
  rows: { number: number; cells: Cell[] }[]
}

// none: ein Wert je Datensatz. list: mehrere, mit Semikolon getrennt. row: ein Eintrag je
// Zeile, weitere in den Zeilen darunter.
export type Multi = 'none' | 'list' | 'row'

type Slot =
  // Ein einfaches Feld oder ein Teil eines zusammengesetzten Felds wie der Entstehungszeit
  | { kind: 'value'; field: FieldDef; part?: Part }
  // Ein Teil eines Felds mit Zeilen, etwa die Person unter den Beteiligten
  | { kind: 'row'; field: FieldDef; part: Part }
  | { kind: 'title'; field: FieldDef; role: 'main' | 'language' | 'more' }

export interface Column {
  header: string
  help: string
  required: boolean
  multi: Multi
  // Auswahl in der Vorlage. strict: nur diese Werte sind erlaubt.
  options?: string[]
  strict: boolean
  format: 'text' | 'date' | 'number'
  // Bei Werken: gehoert die Spalte zum Werk oder zu seiner ersten Fassung?
  scope: 'record' | 'expression'
  slot: Slot
}

export interface SheetDef {
  entity: EntityKey
  name: string
  blurb: string
  columns: Column[]
}

export const TITLE_LANGUAGES = ['la', 'it', 'fr', 'de', 'en']
const EXPRESSION_PREFIX = 'Fassung: '

const LIST_KINDS = new Set<Input['kind']>(['strings', 'terms', 'links', 'refs'])

function hintOf(input: Input, multi: Multi): string {
  const hints: string[] = []
  switch (input.kind) {
    case 'date':
      hints.push('Datum als JJJJ-MM-TT, etwa 1585-03-01.')
      break
    case 'link':
    case 'links':
      hints.push('Vollständiger Link mit https://.')
      break
    case 'number':
      hints.push('Ganze Zahl ab 1.')
      break
    case 'select':
    case 'terms':
      hints.push(`Auswahl: ${input.options.map((option) => option.label).join(', ')}.`)
      break
    case 'ref':
    case 'refs': {
      const target = entityOf(input.to)
      hints.push(
        `Verweis auf ${target.plural}: Name, Nummer oder ID.${input.create ? ' Was es noch nicht gibt, wird angelegt.' : ' Muss es schon geben oder in dieser Datei stehen.'}`,
      )
      break
    }
    case 'piece':
      hints.push('Das Werk über Verzeichnisnummer, Titel oder ID.')
      break
    default:
      break
  }
  if (multi === 'list') {
    hints.push('Mehrere mit Semikolon trennen.')
  } else if (multi === 'row') {
    hints.push('Weitere Einträge in die Zeilen darunter, die übrigen Spalten dort leer lassen.')
  }
  return hints.join(' ')
}

function column(header: string, help: string, input: Input, multi: Multi, required: boolean, scope: Column['scope'], slot: Slot): Column {
  const options =
    input.kind === 'select' || input.kind === 'terms' ? input.options.map((option) => option.label) : input.kind === 'text' && input.suggest ? input.suggest : undefined
  return {
    header,
    help: [help, hintOf(input, multi)].filter(Boolean).join(' '),
    required,
    multi,
    options,
    // Bei Listen stehen mehrere Werte in einer Zelle, das wuerde die Auswahl ablehnen.
    strict: input.kind === 'select',
    format: input.kind === 'date' ? 'date' : input.kind === 'number' ? 'number' : 'text',
    scope,
    slot,
  }
}

function columnsOf(config: Config, key: EntityKey, scope: Column['scope'], prefix: string): Column[] {
  const columns: Column[] = []
  for (const field of entityOf(key).fields) {
    const input = field.input
    if (!isFieldActive(config, key, field) || input.kind === 'auto') {
      continue
    }
    const name = prefix + field.label
    const required = Boolean(field.required && !field.derived)
    if (input.kind === 'titles') {
      const text: Input = { kind: 'text' }
      columns.push(column(name, input.typed ? 'Der Haupttitel.' : field.help, text, 'none', required, scope, { kind: 'title', field, role: 'main' }))
      columns.push({
        ...column(`${name}: Sprache`, 'Sprache der Titel als Kürzel: la, it, fr, de oder en. Leer lassen, wenn keine.', text, 'none', false, scope, { kind: 'title', field, role: 'language' }),
        options: TITLE_LANGUAGES,
        strict: true,
      })
      if (input.max === undefined || input.max > 1) {
        const more = input.typed ? `${prefix}Titelvarianten` : `${name}: weitere`
        columns.push(column(more, 'Weitere Titel in derselben Sprache.', text, 'row', false, scope, { kind: 'title', field, role: 'more' }))
      }
    } else if (input.kind === 'object' || input.kind === 'rows') {
      const parts = input.parts.filter((part) => isPartUsable(config, part) && isSubfieldActive(config, key, field, part))
      const multi: Multi = input.kind === 'rows' ? 'row' : 'none'
      for (const part of parts) {
        const header = parts.length === 1 ? name : `${name}: ${part.label}`
        const help = parts.length === 1 ? field.help : [field.help, part.help].filter(Boolean).join(' ')
        const slot: Slot = input.kind === 'rows' ? { kind: 'row', field, part } : { kind: 'value', field, part }
        columns.push(column(header, help, part.input, multi, false, scope, slot))
      }
    } else {
      columns.push(column(name, field.help, input, LIST_KINDS.has(input.kind) ? 'list' : 'none', required, scope, { kind: 'value', field }))
    }
  }
  return columns
}

// Die Blaetter der Vorlage, passend zur Einrichtung. Fassungen stehen beim Werk: Jedes Werk
// bekommt beim Import genau eine.
export function templateSheets(config: Config): SheetDef[] {
  return ENTITIES.filter((entity) => entity.key !== 'expressions' && isEntityActive(config, entity.key)).map((entity) => ({
    entity: entity.key,
    name: entity.plural,
    blurb: entity.blurb,
    columns:
      entity.key === 'works'
        ? [...columnsOf(config, 'works', 'record', ''), ...columnsOf(config, 'expressions', 'expression', EXPRESSION_PREFIX)]
        : columnsOf(config, entity.key, 'record', ''),
  }))
}

// ---------------------------------------------------------------------------------------
// Einlesen

export interface Issue {
  sheet: string
  row?: number
  column?: string
  text: string
}

export interface AddedGroup {
  entity: EntityKey
  label: string
  count: number
  names: string[]
  // Davon nebenbei angelegt: weil ein Verweis auf sie zeigte, oder als Exemplar einer Handschrift
  created: number
}

export interface ImportResult {
  draft: Draft
  errors: Issue[]
  notes: string[]
  added: AddedGroup[]
  total: number
}

interface TitleState {
  main?: string
  language?: string
  more: string[]
}

interface Pending {
  entity: EntityKey
  sheet: string
  row: number
  values: Values
  expression: Values
  titles: Map<string, TitleState>
  id: string
  // Eine Fassung bekommt ihre ID mit dem Werk.
  work?: WorkDraft
  skipped: boolean
}

interface PendingRef {
  owner: Pending
  text: string
  to: EntityKey
  create: boolean
  piece: boolean
  where: Issue
  set: (id: string) => void
}

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

const isoDate = (date: Date): string =>
  `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

function textOf(cell: Cell): string {
  if (cell === null) {
    return ''
  }
  if (cell instanceof Date) {
    return isoDate(cell)
  }
  return typeof cell === 'number' ? String(cell) : cell.trim()
}

const splitList = (text: string): string[] =>
  text
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Ein Wert, wie ihn das Formular haette. Verweise loest erst resolve() auf.
function parseValue(input: Input, cell: Cell): { value?: unknown; error?: string } {
  const text = textOf(cell)
  switch (input.kind) {
    case 'number': {
      const number = typeof cell === 'number' ? cell : Number(text)
      return Number.isInteger(number) && number >= 1 ? { value: number } : { error: `„${text}“ ist keine ganze Zahl ab 1.` }
    }
    case 'date': {
      if (ISO_DATE.test(text)) {
        return { value: text }
      }
      const german = GERMAN_DATE.exec(text)
      if (german) {
        return { value: `${german[3]}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}` }
      }
      return { error: `„${text}“ ist kein Datum der Form JJJJ-MM-TT.` }
    }
    case 'link':
      return /^https?:\/\/\S+$/.test(text) ? { value: text } : { error: `„${text}“ ist kein vollständiger Link.` }
    case 'links': {
      const links = splitList(text)
      const wrong = links.find((link) => !/^https?:\/\/\S+$/.test(link))
      return wrong ? { error: `„${wrong}“ ist kein vollständiger Link.` } : { value: links }
    }
    case 'select': {
      const option = input.options.find((candidate) => normalize(candidate.label) === normalize(text) || candidate.value === text)
      return option ? { value: option.value } : { error: `„${text}“ steht nicht zur Auswahl (${input.options.map((candidate) => candidate.label).join(', ')}).` }
    }
    case 'terms': {
      const values: string[] = []
      for (const entry of splitList(text)) {
        const option = input.options.find((candidate) => normalize(candidate.label) === normalize(entry) || candidate.value === entry)
        if (!option) {
          return { error: `„${entry}“ steht nicht zur Auswahl (${input.options.map((candidate) => candidate.label).join(', ')}).` }
        }
        values.push(option.value)
      }
      return { value: values }
    }
    case 'strings':
      return { value: splitList(text) }
    case 'langText':
      return { value: { '@none': text } }
    default:
      return { value: text }
  }
}

// Woran sich ein Datensatz in einer Verweisspalte erkennen laesst.
function keysOf(entity: EntityKey, id: string, values: Values): string[] {
  const keys = [id, id.slice(id.indexOf(':') + 1), displayName(entity, values)]
  const identifiers = (values.identifiers as { list?: string; value?: string }[] | undefined) ?? []
  for (const identifier of identifiers) {
    if (identifier.value) {
      keys.push(identifier.value, [identifier.list, identifier.value].filter(Boolean).join(' '))
    }
  }
  switch (entity) {
    case 'persons':
      keys.push([values.familyName, values.givenName].filter(Boolean).join(', '), values.familyName as string, ...((values.alternateNames as string[] | undefined) ?? []))
      break
    case 'institutions':
      keys.push(values.siglum as string, values.abbreviation as string)
      break
    case 'items':
      keys.push(values.shelfmark as string)
      break
    case 'bibliography':
      keys.push(displayName('works', values))
      break
    default:
      break
  }
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && key.trim() !== '').map(normalize))]
}

// Was als schon vorhanden gilt: bei Werken die Verzeichnisnummer, bei Quellen die Sigle,
// sonst der Name. Titel allein sind zu oft gleich.
function duplicateKey(entity: EntityKey, values: Values): string | null {
  const identifiers = ((values.identifiers as { list?: string; value?: string }[] | undefined) ?? []).filter((identifier) => identifier.value?.trim())
  switch (entity) {
    case 'works': {
      const identifier = identifiers[0]
      return identifier ? normalize(`${identifier.list ?? ''} ${identifier.value}`) : null
    }
    case 'manifestations': {
      const siglum = identifiers.find((identifier) => identifier.list === 'Sigle')
      return siglum ? normalize(siglum.value!) : null
    }
    case 'items':
      return null
    default: {
      const name = displayName(entity, values)
      return name ? normalize(name) : null
    }
  }
}

const DUPLICATE_WHAT: Partial<Record<EntityKey, string>> = { works: 'Verzeichnisnummer', manifestations: 'Sigle' }

export function importSheets(config: Config, draft: Draft, sheets: SheetInput[]): ImportResult {
  const errors: Issue[] = []
  const notes: string[] = []
  const definitions = templateSheets(config)
  const abbreviation = config.catalogue.abbreviation.trim()
  const pendings: Pending[] = []
  const refs: PendingRef[] = []

  for (const sheet of sheets) {
    const definition = definitions.find((candidate) => normalize(candidate.name) === normalize(sheet.name))
    const dataRows = sheet.rows.slice(1).filter((row) => row.cells.some((cell) => textOf(cell) !== ''))
    if (!definition) {
      if (dataRows.length > 0 && normalize(sheet.name) !== 'anleitung') {
        notes.push(`Das Blatt „${sheet.name}“ passt zu keinem eingeschalteten Datentyp und wird übergangen.`)
      }
      continue
    }
    if (sheet.rows.length === 0) {
      continue
    }
    const byHeader = new Map(definition.columns.map((candidate) => [normalize(candidate.header), candidate]))
    const columns: (Column | undefined)[] = []
    sheet.rows[0].cells.forEach((cell, index) => {
      const header = normalize(textOf(cell).replace(/\*\s*$/, ''))
      if (!header) {
        return
      }
      const match = byHeader.get(header)
      if (!match) {
        notes.push(`${sheet.name}: Die Spalte „${textOf(cell)}“ ist unbekannt oder in der Einrichtung abgeschaltet und wird übergangen.`)
      } else if (columns.includes(match)) {
        errors.push({ sheet: sheet.name, column: match.header, text: 'Die Spalte steht doppelt in der Tabelle.' })
      } else {
        columns[index] = match
      }
    })

    let current: Pending | null = null
    for (const row of dataRows) {
      const filled = row.cells
        .map((cell, index) => ({ cell, column: columns[index] }))
        .filter((entry): entry is { cell: Cell; column: Column } => entry.column !== undefined && textOf(entry.cell) !== '')
      if (filled.length === 0) {
        continue
      }
      // Ohne einfachen Wert setzt die Zeile nur Eintraege des Datensatzes darueber fort.
      if (!current || filled.some((entry) => entry.column.multi === 'none')) {
        current = { entity: definition.entity, sheet: sheet.name, row: row.number, values: {}, expression: {}, titles: new Map(), id: '', skipped: false }
        pendings.push(current)
      }
      const owner: Pending = current
      // Je Feld mit Zeilen ein Eintrag aus dieser Zeile
      const entries = new Map<string, { target: Values; field: FieldDef; entry: Values }>()
      for (const { cell, column } of filled) {
        const where: Issue = { sheet: sheet.name, row: row.number, column: column.header, text: '' }
        const fail = (text: string) => errors.push({ ...where, text })
        const target = column.scope === 'expression' ? owner.expression : owner.values
        const slot = column.slot
        const text = textOf(cell)

        if (slot.kind === 'title') {
          const key = `${column.scope}.${slot.field.key}`
          const state = owner.titles.get(key) ?? { more: [] }
          owner.titles.set(key, state)
          if (slot.role === 'main') {
            state.main = text
          } else if (slot.role === 'more') {
            state.more.push(text)
          } else if (TITLE_LANGUAGES.includes(text.toLowerCase())) {
            state.language = text.toLowerCase()
          } else {
            fail(`„${text}“ ist kein Sprachkürzel (${TITLE_LANGUAGES.join(', ')}).`)
          }
          continue
        }

        let container: Values
        let key: string
        let input: Input
        if (slot.kind === 'row') {
          const entryKey = `${column.scope}.${slot.field.key}`
          const existing = entries.get(entryKey) ?? { target, field: slot.field, entry: {} }
          entries.set(entryKey, existing)
          container = existing.entry
          key = slot.part.key
          input = slot.part.input
        } else if (slot.part) {
          container = (target[slot.field.key] as Values | undefined) ?? {}
          target[slot.field.key] = container
          key = slot.part.key
          input = slot.part.input
        } else {
          container = target
          key = slot.field.key
          input = slot.field.input
        }

        if (input.kind === 'ref' || input.kind === 'piece') {
          container[key] = text
          refs.push({
            owner,
            text,
            to: input.kind === 'ref' ? input.to : 'works',
            create: input.kind === 'ref' && Boolean(input.create),
            piece: input.kind === 'piece',
            where,
            set: (id) => {
              container[key] = id
            },
          })
          continue
        }
        if (input.kind === 'refs') {
          const list = (container[key] as string[] | undefined) ?? []
          container[key] = list
          for (const entry of splitList(text)) {
            const index = list.push(entry) - 1
            refs.push({ owner, text: entry, to: input.to, create: Boolean(input.create), piece: false, where, set: (id) => (list[index] = id) })
          }
          continue
        }
        const parsed = parseValue(input, cell)
        if (parsed.error) {
          fail(parsed.error)
        } else if (Array.isArray(parsed.value)) {
          container[key] = [...((container[key] as unknown[] | undefined) ?? []), ...parsed.value]
        } else {
          container[key] = parsed.value
        }
      }
      for (const { target, field, entry } of entries.values()) {
        const input = field.input as Extract<Input, { kind: 'rows' }>
        // Die eigene Verzeichnisnummer braucht in der Tabelle kein Kuerzel.
        if (owner.entity === 'works' && target === owner.values && field.key === 'identifiers' && !entry.list && abbreviation) {
          entry.list = abbreviation
        }
        const rows = (target[field.key] as Values[] | undefined) ?? []
        // Das Objekt selbst, nicht eine Kopie: offene Verweise schreiben spaeter hinein.
        target[field.key] = [...rows, Object.assign(entry, { ...input.defaults, ...entry })]
      }
    }
  }

  // Titel aus Haupttitel, Sprache und Varianten
  for (const pending of pendings) {
    for (const [key, state] of pending.titles) {
      const [scope, field] = key.split('.')
      const texts = [state.main, ...state.more].filter((text): text is string => Boolean(text))
      if (texts.length > 0) {
        const target = scope === 'expression' ? pending.expression : pending.values
        target[field] = texts.map((text) => ({ text: { [state.language ?? '@none']: text } }))
      }
    }
  }

  // Schon Vorhandenes wird uebersprungen, Doppeltes in der Datei ist ein Fehler.
  const existingKeys = new Map<EntityKey, Set<string>>()
  for (const entity of ENTITIES) {
    const values = entity.key === 'works' ? draft.works.map((work) => work.values) : entity.key === 'expressions' ? [] : draft.records[entity.key as PlainEntity]
    existingKeys.set(entity.key, new Set(values.map((record) => duplicateKey(entity.key, record)).filter((key): key is string => key !== null)))
  }
  const seen = new Map<string, Pending>()
  const skipped = new Map<EntityKey, number>()
  for (const pending of pendings) {
    const key = duplicateKey(pending.entity, pending.values)
    if (key === null) {
      continue
    }
    if (existingKeys.get(pending.entity)!.has(key)) {
      pending.skipped = true
      skipped.set(pending.entity, (skipped.get(pending.entity) ?? 0) + 1)
      continue
    }
    const earlier = seen.get(`${pending.entity} ${key}`)
    if (earlier) {
      errors.push({ sheet: pending.sheet, row: pending.row, text: `Steht doppelt in der Datei, auch in Zeile ${earlier.row}${DUPLICATE_WHAT[pending.entity] ? ` (gleiche ${DUPLICATE_WHAT[pending.entity]})` : ''}.` })
    } else {
      seen.set(`${pending.entity} ${key}`, pending)
    }
  }
  for (const [entity, count] of skipped) {
    const what = DUPLICATE_WHAT[entity] ? `gleiche ${DUPLICATE_WHAT[entity]}` : 'gleicher Name'
    notes.push(`${entityOf(entity).plural}: ${count} gibt es schon (${what}). Sie werden übersprungen, nicht verändert.`)
  }
  const active = pendings.filter((pending) => !pending.skipped)

  // IDs vergeben
  const taken = new Map<EntityKey, string[]>()
  for (const entity of ENTITIES) {
    if (entity.key !== 'works' && entity.key !== 'expressions') {
      taken.set(entity.key, draft.records[entity.key as PlainEntity].map((record) => record['@id'] as string))
    }
  }
  const allWorks = [...draft.works]
  for (const pending of active) {
    if (pending.entity === 'works') {
      const work = assignWorkIds({ id: '', values: pending.values, expressions: [{ id: '', label: '', values: pending.expression }] }, allWorks)
      allWorks.push(work)
      pending.work = work
      pending.id = work.id
    } else {
      const list = taken.get(pending.entity)!
      const identifiers = pending.values.identifiers as { value?: string }[] | undefined
      const base = identifiers?.find((identifier) => identifier.value?.trim())?.value || displayName(pending.entity, pending.values) || 'neu'
      pending.id = uniqueId(pending.entity, base, list)
      list.push(pending.id)
    }
  }

  // Verweise aufloesen; Hilfsdatensaetze, die es noch nicht gibt, entstehen dabei.
  const index = new Map<EntityKey, Map<string, Set<string>>>()
  const addKeys = (entity: EntityKey, id: string, values: Values) => {
    const map = index.get(entity) ?? new Map<string, Set<string>>()
    index.set(entity, map)
    for (const key of keysOf(entity, id, values)) {
      map.set(key, (map.get(key) ?? new Set()).add(id))
    }
  }
  for (const work of draft.works) {
    addKeys('works', work.id, work.values)
  }
  for (const entity of ENTITIES) {
    if (entity.key !== 'works' && entity.key !== 'expressions') {
      for (const record of draft.records[entity.key as PlainEntity]) {
        addKeys(entity.key, record['@id'] as string, record)
      }
    }
  }
  for (const pending of active) {
    addKeys(pending.entity, pending.id, pending.values)
  }
  const expressionsOf = new Map(allWorks.map((work) => [work.id, work.expressions.map((expression) => expression.id)]))
  const expressionIds = new Set(allWorks.flatMap((work) => work.expressions.map((expression) => expression.id)))
  const created: { entity: PlainEntity; record: Values }[] = []

  for (const ref of refs) {
    if (ref.owner.skipped) {
      continue
    }
    const fail = (text: string) => errors.push({ ...ref.where, text })
    if (ref.piece) {
      const direct = [ref.text, `expressions:${ref.text}`].find((candidate) => expressionIds.has(candidate))
      if (direct) {
        ref.set(direct)
        continue
      }
    }
    const matches = [...(index.get(ref.to)?.get(normalize(ref.text)) ?? [])]
    if (matches.length > 1) {
      fail(`„${ref.text}“ ist mehrdeutig: ${matches.slice(0, 5).join(', ')}${matches.length > 5 ? ' …' : ''}. Bitte die ID angeben.`)
      continue
    }
    if (matches.length === 1) {
      if (!ref.piece) {
        ref.set(matches[0])
        continue
      }
      const expressions = expressionsOf.get(matches[0]) ?? []
      if (expressions.length === 1) {
        ref.set(expressions[0])
      } else {
        fail(
          expressions.length === 0
            ? `Das Werk ${matches[0]} hat keine Fassung, auf die die Quelle verweisen könnte.`
            : `Das Werk ${matches[0]} hat mehrere Fassungen. Bitte die ID der Fassung angeben: ${expressions.join(', ')}.`,
        )
      }
      continue
    }
    if (!ref.create) {
      fail(`${entityOf(ref.to).label} „${ref.text}“ gibt es weder im Verzeichnis noch in der Datei.`)
      continue
    }
    const entity = ref.to as PlainEntity
    const record = recordFromName(entity, ref.text)
    const list = taken.get(entity)!
    const id = uniqueId(entity, entity === 'persons' ? (record.familyName as string) : ref.text, list)
    list.push(id)
    created.push({ entity, record: { ...record, '@id': id } })
    addKeys(entity, id, record)
    ref.set(id)
  }

  // Pflichtangaben und unvollstaendige Eintraege, wie im Formular
  for (const pending of active) {
    const entity = entityOf(pending.entity)
    const missing = missingRequired(config, entity, pending.values)
    if (missing.length > 0) {
      errors.push({ sheet: pending.sheet, row: pending.row, text: `Es fehlt: ${missing.join(', ')}.` })
    }
    const incomplete = [
      ...incompleteRows(config, entity, pending.values),
      ...(pending.entity === 'works' ? incompleteRows(config, entityOf('expressions'), pending.expression).map((label) => `${EXPRESSION_PREFIX}${label}`) : []),
    ]
    if (incomplete.length > 0) {
      errors.push({ sheet: pending.sheet, row: pending.row, text: `Unvollständige Einträge (etwa Nummer ohne Verzeichnis oder Person ohne Rolle): ${incomplete.join(', ')}.` })
    }
  }

  // Zusammensetzen
  let next: Draft = {
    ...draft,
    works: [...draft.works, ...active.filter((pending) => pending.work).map((pending) => pending.work!)],
    records: { ...draft.records },
  }
  for (const entity of ENTITIES) {
    if (entity.key === 'works' || entity.key === 'expressions') {
      continue
    }
    const key = entity.key as PlainEntity
    const added = [
      ...active.filter((pending) => pending.entity === key).map((pending) => ({ ...pending.values, '@id': pending.id })),
      ...created.filter((entry) => entry.entity === key).map((entry) => entry.record),
    ]
    if (added.length > 0) {
      next.records[key] = [...draft.records[key], ...added]
    }
  }
  // Wie im Formular: Eine Handschrift bekommt ihr Exemplar gleich mit.
  let autoItems = 0
  if (isEntityActive(config, 'items')) {
    for (const pending of active) {
      if (pending.entity === 'manifestations' && isManuscript(pending.values) && itemsOfSource(next, pending.id).length === 0) {
        next = withSourceItem(next, pending.id, {})
        autoItems += 1
      }
    }
  }
  if (autoItems > 0) {
    notes.push(`${autoItems} Handschrift(en) ohne Exemplar in der Datei: Ihr Exemplar wird automatisch angelegt.`)
  }

  const added: AddedGroup[] = []
  for (const entity of ENTITIES) {
    if (entity.key === 'expressions') {
      continue
    }
    const own = active.filter((pending) => pending.entity === entity.key)
    const extra = created.filter((entry) => entry.entity === entity.key)
    const names = [
      ...own.map((pending) => displayName(entity.key, pending.values) || pending.id),
      ...extra.map((entry) => displayName(entity.key, entry.record) || (entry.record['@id'] as string)),
    ]
    const items = entity.key === 'items' ? autoItems : 0
    if (names.length + items > 0) {
      added.push({ entity: entity.key, label: entity.plural, count: names.length + items, names, created: extra.length + items })
    }
  }
  const total = added.reduce((sum, group) => sum + group.count, 0)

  return { draft: next, errors, notes, added, total }
}
