// Prueft den Baukasten gegen die Vorlage. Aufruf: npm run check:baukasten
//
// 1. Jedes Schemafeld ist ein Baustein und umgekehrt.
// 2. Die Kennzeichnung MeLODy/Erweiterung stimmt mit dem JSON-LD-Kontext ueberein.
// 3. Jede Vorlage und ein voll ausgefuelltes Verzeichnis ergeben Daten, die
//    scripts/validate.py und scripts/export_melody.py aus der Vorlage annehmen.
// 4. Ein geoeffnetes Verzeichnis bleibt beim Speichern ohne Aenderung Byte fuer Byte
//    gleich, und eine Aenderung beruehrt nur, was geaendert wurde.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assignWorkIds,
  buildCollections,
  buildFiles,
  changedFiles,
  configForDraft,
  createMissingExpressions,
  DATA_FILES,
  draftFromFiles,
  emptyDraft,
  newWork,
  runChecks,
  sampleDraft,
  type Draft,
  type Values,
} from '../src/baukasten/generate.ts'
import { configFromPreset, ENTITIES, ENTITY_KEYS, PRESETS, type Config } from '../src/baukasten/model.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Die Vorlage liegt als Geschwisterordner neben diesem Projekt, unter neuem oder altem Namen.
const templateDir = process.env.WV_TEMPLATE_DIR ?? ['gfbm-werkverzeichnisse', 'lassoDBData'].map((name) => path.resolve(root, '..', name)).find((folder) => existsSync(folder)) ?? path.resolve(root, '..', 'gfbm-werkverzeichnisse')
const dataRepo = templateDir
const readJson = (file: string) => JSON.parse(readFileSync(path.join(dataRepo, file), 'utf8'))

const failures: string[] = []
const check = (condition: boolean, message: string) => {
  if (!condition) {
    failures.push(message)
  }
}

// Felder, die nur Technik sind.
const SYSTEM_FIELDS = new Set(['@id', '@type'])
// Felder, die der Baukasten ohne eigenen Schalter selbst setzt.
const DERIVED_ONLY = new Set(['expressions.partOfExpression'])

const schema = readJson('schema/catalogue.schema.json')
// Der Kontext enthaelt nur JSON mit Leerzeilen, ist also normal lesbar.
const context = readJson('schema/context.jsonld')['@context']
for (const entity of ENTITIES) {
  const schemaFields = Object.keys(schema.$defs[entity.key].properties).filter((key) => !SYSTEM_FIELDS.has(key))
  const fieldKeys = entity.fields.map((field) => field.key)
  for (const key of schemaFields) {
    check(fieldKeys.includes(key) || DERIVED_ONLY.has(`${entity.key}.${key}`), `${entity.key}.${key} steht im Schema, fehlt aber im Baukasten`)
  }
  for (const field of entity.fields) {
    check(schemaFields.includes(field.key), `${entity.key}.${field.key} steht im Baukasten, fehlt aber im Schema`)
    const mapping = context[field.key]
    const term: string = typeof mapping === 'string' ? mapping : (mapping?.['@id'] ?? '')
    check(term !== '', `${entity.key}.${field.key} fehlt im Kontext`)
    check(term.startsWith('wv:') === (field.origin === 'wv'), `${entity.key}.${field.key}: Kennzeichnung ${field.origin}, Kontext ${term}`)
  }
}

// Schaltet alles ein, was es gibt.
function everything(base: Config): Config {
  const config = structuredClone(base)
  for (const key of ENTITY_KEYS) {
    config.entities[key] = true
  }
  for (const entity of ENTITIES) {
    for (const field of entity.fields) {
      config.fields[`${entity.key}.${field.key}`] = true
      if (field.input.kind === 'rows') {
        for (const part of field.input.parts) {
          if (part.toggle) {
            config.fields[`${entity.key}.${field.key}.${part.key}`] = true
          }
        }
      }
    }
  }
  return config
}

// Ein Verzeichnis, das jeden Datentyp und die heiklen Faelle benutzt. Die Inhalte sind erfunden.
function fullDraft(config: Config): Draft {
  const draft = emptyDraft()
  const place = 'places:musterstadt'
  const person = 'persons:dichterin'
  draft.records.places.push({ '@id': place, name: 'Musterstadt', country: 'https://www.geonames.org/2921044', sameAs: ['https://www.geonames.org/1/'] })
  draft.records.persons.push({
    '@id': person,
    familyName: 'Dichterin',
    givenName: 'Erika',
    alternateNames: ['E. D.'],
    birthDate: { description: 'um 1850', date: '1850-01-01', certainty: 'terms:LowCertainty' },
    deathPlace: place,
    occupations: ['Dichterin'],
  })
  draft.records.institutions.push({ '@id': 'institutions:bib', name: 'Bibliothek & Archiv', siglum: 'XX-Bib', place })
  draft.records.instrumentations.push({ '@id': 'instrumentations:duo', label: 'Duo', details: [{ description: 'Violoncello', quantity: 1 }, { description: 'Klavier' }] })
  draft.records.bibliography.push(
    { '@id': 'bibliography:ga', abbreviation: 'GA', genre: 'terms:Book', titles: [{ text: { de: 'Gesamtausgabe' } }], authors: [person], editors: [person] },
    { '@id': 'bibliography:ga-1', abbreviation: 'GA 1', series: 'bibliography:ga', volumeNumber: '1', pagination: '1-20', publication: { startDate: '1990-01-01', endDate: '1990-12-31', place, publisherName: 'Musterverlag', label: 'Musterstadt 1990' } },
  )
  const parent = assignWorkIds(
    {
      ...newWork(config),
      values: {
        titles: [{ text: { de: 'Sonate' } }, { text: { de: 'Sonate D-Dur' } }],
        identifiers: [{ list: 'op.', value: '17' }],
        contributors: [{ agent: person, role: 'terms:Lyricist', certainty: 'terms:MediumCertainty' }],
        status: 'authentic',
        genres: ['Sonate'],
        citations: [{ inBibliography: 'bibliography:ga-1', number: '3', page: '12', section: 'I' }],
        textSources: ['Psalm 150'],
        sameAs: ['https://example.org/werke/1'],
        notes: [{ label: 'Bemerkung', html: 'A & B < C' }],
      },
      expressions: [
        {
          id: '',
          label: '',
          values: {
            languages: ['terms:German'],
            instrumentation: 'instrumentations:duo',
            key: { description: 'D-Dur' },
            meter: { meterCount: 3, meterUnit: 4, meterSymbol: 'C', description: '3/4' },
            tempo: 'Allegro',
            duration: '20 Min.',
            incipit: { pae: '@clef:G-2', incipitText: { de: 'Anfang' } },
            dateCreated: { description: '1878', date: '1878-01-01' },
            placeCreated: place,
          },
        },
        { id: '', label: 'Fassung für Viola', values: { titles: [{ text: { de: 'Sonate für Viola' } }] } },
      ],
    },
    [],
  )
  draft.works.push(parent)
  const part = assignWorkIds({ ...newWork(config), values: { titles: [{ text: { '@none': 'Erster Satz' } }], partOfWork: parent.id } }, draft.works)
  draft.works.push(part)
  draft.records.manifestations.push(
    {
      '@id': 'manifestations:druck',
      titles: [{ text: { '@none': 'Sonate. Erstausgabe' } }],
      classifications: ['terms:Print'],
      identifiers: [{ list: 'Plattennummer', value: '123' }],
      contents: [
        { embodies: parent.expressions[0].id, position: '1', titleInSource: 'Sonate', voices: 2, note: 'x', part: '1' },
        { embodies: parent.expressions[1].id },
        { titleInSource: 'Unbekanntes Stück' },
        // Leere Zeile: darf nicht in die Datei.
        { note: '' },
      ],
      publication: { label: 'Musterstadt 1880', place },
      titlePages: [{ html: 'SONATE' }],
      contributors: [{ agent: person, role: 'terms:Composer' }],
      sourceType: 'Partitur',
      partbooks: 'Cantus',
      dating: 'um 1880',
      literature: ['Muster 2000'],
    },
    { '@id': 'manifestations:stimme', titles: [{ text: { '@none': 'Stimme' } }], partOfManifestation: 'manifestations:druck' },
  )
  draft.records.items.push({ '@id': 'items:1', exemplifies: 'manifestations:druck', keeper: 'institutions:bib', shelfmark: 'Mus. 1', formerShelfmark: 'Alt 1', sameAs: ['https://example.org/d/1'] })
  return draft
}

const scratch = mkdtempSync(path.join(tmpdir(), 'baukasten-'))

function runScripts(label: string, config: Config, draft: Draft) {
  const blocking = runChecks(config, draft).filter((entry) => entry.level === 'error')
  check(blocking.length === 0, `${label}: Prüfung des Baukastens meldet ${blocking.map((entry) => entry.text).join(' | ')}`)
  const folder = path.join(scratch, label)
  mkdirSync(folder, { recursive: true })
  for (const [file, content] of Object.entries(buildFiles(config, draft))) {
    writeFileSync(path.join(folder, file), content)
  }
  const python = process.env.PYTHON ?? 'python'
  try {
    const validated = execFileSync(python, [path.join(dataRepo, 'scripts', 'validate.py'), folder], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    console.log(`  ${validated.trim().split('\n').pop()}`)
    execFileSync(python, [path.join(dataRepo, 'scripts', 'export_melody.py'), '--data', folder, '--out', path.join(scratch, `${label}-ttl`)], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: 'pipe' })
    console.log('  MeLODy-Export ok')
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message: string }
    failures.push(`${label}: ${failed.stdout ?? ''}${failed.stderr ?? failed.message}`)
  }
}

for (const preset of PRESETS) {
  const config = configFromPreset(preset.id)
  for (const [variant, draft] of [
    ['leer', emptyDraft()],
    ['beispiel', sampleDraft(config)],
  ] as const) {
    console.log(`${preset.id}, ${variant}`)
    runScripts(`${preset.id}-${variant}`, config, draft)
  }
  console.log(`${preset.id}, alles eingeschaltet`)
  const full = everything(config)
  runScripts(`${preset.id}-voll`, full, fullDraft(full))
}

// Die Kopplung selbst.
{
  const coupled = configFromPreset('lasso')
  const { collections } = buildCollections(coupled, sampleDraft(coupled))
  const expression = collections.expressions[0] as Values
  check(collections.works[0].realisedIn?.toString() === 'expressions:90', 'Gekoppelt: Werk verweist nicht auf seine Expression')
  check(expression.label === 'Elle s’en va', 'Gekoppelt: Bezeichnung folgt nicht dem Titel')
  check((expression.languages as string[])?.[0] === 'terms:French', 'Gekoppelt: Sprache folgt nicht dem Titel')
  check((collections.works[0].contributors as Values[])[0].role === 'terms:Composer', 'Komponist*in fehlt an erster Stelle')

  // Ausgeschaltete Felder duerfen nicht in die Datei.
  const reduced = structuredClone(coupled)
  reduced.fields['manifestations.contents.voices'] = false
  reduced.entities.places = false
  const reducedFiles = buildCollections(reduced, sampleDraft(reduced)).collections
  const content = (reducedFiles.manifestations[0].contents as Values[])[0]
  check(!('voices' in content), 'Abgewähltes Teilfeld landet in der Datei')
  check(!('place' in (reducedFiles.manifestations[0].publication as Values)), 'Verweis auf abgewählten Typ landet in der Datei')

  const manual = { ...configFromPreset('blank'), expressionMode: 'manual' as const }
  const draft = emptyDraft()
  draft.works.push(assignWorkIds({ ...newWork(manual), values: { titles: [{ text: { de: 'Lied' } }] } }, []))
  check(runChecks(manual, draft).some((entry) => entry.fix === 'createExpressions'), 'Manuell: Werk ohne Expression wird nicht gemeldet')
  const healed = createMissingExpressions(draft)
  check(healed.works[0].expressions[0]?.id === 'expressions:Lied', 'Manuell: Reparatur legt keine Expression an')
  check(runChecks(manual, healed).every((entry) => entry.level !== 'error'), 'Manuell: nach der Reparatur bleibt ein Fehler')
}

// Oeffnen und unveraendert speichern: dieselben Bytes, egal welche Felder gerade an sind.
{
  const folders = [path.join(dataRepo, 'data'), ...readdirSync(path.join(dataRepo, 'examples'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(dataRepo, 'examples', entry.name))]
  for (const folder of folders) {
    const label = path.relative(dataRepo, folder)
    const files = Object.fromEntries(DATA_FILES.map((file) => [file, readFileSync(path.join(folder, file), 'utf8')]))
    const original = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, text.replace(/\r\n/g, '\n')]))
    for (const preset of PRESETS) {
      const draft = draftFromFiles(files, label)
      // Beim Oeffnen uebernimmt der Baukasten Name und Kuerzel aus catalog.json. Die Feldauswahl
      // dagegen darf beliebig sein: nur die Vorlage, alles mit Daten an oder alles an.
      const catalogue = configForDraft(configFromPreset(preset.id), draft).catalogue
      const variants = [configFromPreset(preset.id), configForDraft(configFromPreset(preset.id), draft), everything(configFromPreset(preset.id))]
      for (const config of variants.map((variant) => ({ ...variant, catalogue }))) {
        const built = buildFiles(config, draft)
        for (const file of DATA_FILES) {
          check(built[file] === original[file], `${label}, ${preset.id}: ${file} ändert sich, obwohl nichts bearbeitet wurde`)
        }
      }
    }
    console.log(`${label}: unverändert gespeichert = unverändert`)

    const draft = draftFromFiles(files, label)
    const config = configForDraft(configFromPreset('blank'), draft)
    if (draft.works.length === 0) {
      continue
    }
    // Ein Titel wird geaendert: nur dieses Werk und seine Fassung aendern sich.
    const edited = structuredClone(draft)
    const work = edited.works[0]
    const titles = structuredClone(work.values.titles) as { text: Record<string, string> }[]
    const language = Object.keys(titles[0].text)[0]
    titles[0].text[language] = `${titles[0].text[language]} (geändert)`
    work.values.titles = titles
    const changed = changedFiles(config, edited)
    check(changed.every((file) => file === 'works.json' || file === 'expressions.json'), `${label}: Titeländerung ändert auch ${changed.join(', ')}`)
    const before = JSON.parse(original['works.json']).entries as Values[]
    const after = JSON.parse(buildFiles(config, edited)['works.json']).entries as Values[]
    check(after.length === before.length, `${label}: Anzahl der Werke ändert sich`)
    check(after.slice(1).every((record, index) => JSON.stringify(record) === JSON.stringify(before[index + 1])), `${label}: andere Werke ändern sich mit`)
    const { titles: _a, ...restAfter } = after[0]
    const { titles: _b, ...restBefore } = before[0]
    check(JSON.stringify(restAfter) === JSON.stringify(restBefore), `${label}: am geänderten Werk ändert sich mehr als der Titel`)

    // Ein neues Werk kommt ans Ende, alles Vorhandene bleibt.
    const added = structuredClone(draft)
    added.works.push(assignWorkIds({ ...newWork(config), values: { titles: [{ text: { de: 'Neues Stück' } }] } }, added.works))
    const addedFiles = buildFiles(config, added)
    const addedWorks = JSON.parse(addedFiles['works.json']).entries as Values[]
    check(JSON.stringify(addedWorks.slice(0, before.length)) === JSON.stringify(before), `${label}: ein neues Werk verändert vorhandene`)
    check(changedFiles(config, added).every((file) => file === 'works.json' || file === 'expressions.json'), `${label}: ein neues Werk ändert weitere Dateien`)
    console.log(`${label}: Änderungen bleiben auf das Geänderte beschränkt`)
  }
}

// Ein frisches Projekt (leeres data/ ohne Komponist*in) bekommt sie aus dem Baukasten,
// und das Ergebnis besteht validate.py.
{
  const folder = path.join(dataRepo, 'data')
  const files = Object.fromEntries(DATA_FILES.map((file) => [file, readFileSync(path.join(folder, file), 'utf8')]))
  const fresh = draftFromFiles(files, 'neu')
  const config = { ...configFromPreset('lebeau'), catalogue: { label: 'Werkverzeichnis Luise Adolpha Le Beau', abbreviation: 'LBWV', composer: 'Le Beau, Luise Adolpha' } }
  const { catalog, collections } = buildCollections(config, fresh)
  check(catalog.composer === 'persons:le-beau', `Frisches Verzeichnis: Komponist*in fehlt im Katalog (${String(catalog.composer)})`)
  check(collections.persons.some((person) => person['@id'] === 'persons:le-beau'), 'Frisches Verzeichnis: Personendatensatz der Komponist*in fehlt')
  check(catalog.label === 'Werkverzeichnis Luise Adolpha Le Beau' && catalog['@context'] === '../schema/context.jsonld', 'Frisches Verzeichnis: Name oder Kontext stimmt nicht')
  runScripts('frisch', config, fresh)
}

rmSync(scratch, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n${failures.length} Fehler:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log('\nBaukasten stimmt mit Schema, Kontext, validate.py und Export überein.')
