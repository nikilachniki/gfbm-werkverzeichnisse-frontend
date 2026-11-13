// Prueft den Excel-Import einmal ganz durch. Aufruf: npm run check:import
//
// Die Vorlage zu examples/lasso-schwierig wird erzeugt, wie in Excel ausgefuellt, wieder
// eingelesen und importiert. Danach muessen die neuen Datensaetze stimmen und die Pruefung
// darf keine neuen Fehler melden.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCollections, configForDraft, DATA_FILES, draftFromFiles, runChecks, type Values } from '../src/baukasten/generate.ts'
import { configFromPreset } from '../src/baukasten/model.ts'
import { readWorkbook, templateFile } from '../src/baukasten/excel.ts'
import { importSheets, templateSheets } from '../src/baukasten/importSheets.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templateDir = process.env.WV_TEMPLATE_DIR ?? ['gfbm-werkverzeichnisse', 'lassoDBData'].map((name) => path.resolve(root, '..', name)).find((folder) => existsSync(folder)) ?? path.resolve(root, '..', 'gfbm-werkverzeichnisse')
const folder = path.join(templateDir, 'examples', 'lasso-schwierig')
const ExcelJS = createRequire(import.meta.url)('exceljs')

const failures: string[] = []
const check = (condition: boolean, message: string) => {
  if (!condition) {
    failures.push(message)
  }
}

const files = Object.fromEntries(DATA_FILES.map((file) => [file, readFileSync(path.join(folder, file), 'utf8')]))
const draft = draftFromFiles(files, 'lasso-schwierig')
const config = configForDraft(configFromPreset('lasso'), draft)
const sheets = templateSheets(config)

for (const sheet of sheets) {
  const headers = sheet.columns.map((column) => column.header.toLowerCase())
  check(new Set(headers).size === headers.length, `${sheet.name}: Spaltennamen doppelt`)
}

// Vorlage schreiben und wie in Excel ausfuellen
const template = Buffer.from(await (await templateFile(config.catalogue.label, sheets)).arrayBuffer())
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(template)
check(workbook.getWorksheet('Anleitung') !== undefined, 'Vorlage ohne Anleitung')
const fill = (sheetName: string, rows: Record<string, unknown>[]) => {
  const worksheet = workbook.getWorksheet(sheetName)
  const headers: string[] = []
  worksheet.getRow(1).eachCell((cell: { value: unknown }, column: number) => {
    headers[column] = String(cell.value).replace(/ \*$/, '')
  })
  rows.forEach((values, index) => {
    for (const [key, value] of Object.entries(values)) {
      const column = headers.indexOf(key)
      if (column < 0) {
        throw new Error(`Keine Spalte „${key}“ im Blatt ${sheetName}. Vorhanden: ${headers.filter(Boolean).join(' | ')}`)
      }
      worksheet.getRow(index + 2).getCell(column).value = value
    }
  })
}
fill('Werke', [
  { Titel: 'Testmotette eins', 'Titel: Sprache': 'la', 'Verzeichnisnummer: Nummer': '9001', 'Beteiligte: Person': 'Mustermann, Erika', 'Beteiligte: Rolle': 'Text', Textprovenienz: 'Psalm 1; Psalm 2' },
  { Titelvarianten: 'Testmotette Variante', 'Beteiligte: Person': 'Clément Marot' },
  { Titel: 'Testmotette zwei', 'Verzeichnisnummer: Nummer': '9002', 'Teil von': '9001', 'Fassung: Besetzung': 'Neue Besetzung' },
  { Titel: 'Schon vorhanden', 'Verzeichnisnummer: Nummer': '90' },
])
fill('Quellen', [
  { Titel: 'Testhandschrift', Art: 'Handschrift', 'Sigle und Katalognummern: Verzeichnis': 'Sigle', 'Sigle und Katalognummern: Nummer': 'TEST-1', 'Enthaltene Stücke: Werk': 'LV 9001', 'Enthaltene Stücke: Nr. in der Quelle': '1' },
  { 'Enthaltene Stücke: Werk': '9002', 'Enthaltene Stücke: Nr. in der Quelle': '2' },
  { 'Enthaltene Stücke: Titel in der Quelle': 'Unbekanntes Stück', 'Enthaltene Stücke: Nr. in der Quelle': '3' },
])
fill('Personen', [{ Familienname: 'Mustermann', Vorname: 'Erika', 'Externe Links': 'https://d-nb.info/gnd/1' }])
const filled = Buffer.from(await workbook.xlsx.writeBuffer())

const result = importSheets(config, draft, await readWorkbook(new File([filled], 'ausgefuellt.xlsx')))
check(result.errors.length === 0, `Unerwartete Fehler: ${JSON.stringify(result.errors)}`)
check(result.notes.some((note) => note.startsWith('Werke: 1 gibt es schon')), `Vorhandenes Werk nicht übersprungen: ${JSON.stringify(result.notes)}`)
const counts = Object.fromEntries(result.added.map((group) => [group.entity, group.count]))
check(counts.works === 2 && counts.manifestations === 1 && counts.items === 1 && counts.persons === 1 && counts.instrumentations === 1, `Falsche Anzahl: ${JSON.stringify(counts)}`)

const before = new Set(runChecks(config, draft).map((entry) => entry.text))
const newChecks = runChecks(config, result.draft).filter((entry) => entry.level === 'error' && !before.has(entry.text))
check(newChecks.length === 0, `Neue Prüfmeldungen: ${JSON.stringify(newChecks)}`)

const { collections } = buildCollections(config, result.draft)
const find = (entity: keyof typeof collections, id: string): Values | undefined => collections[entity].find((record) => record['@id'] === id)
const first = find('works', 'works:9001')
const second = find('works', 'works:9002')
const source = collections.manifestations.find((record) => JSON.stringify(record.identifiers ?? []).includes('TEST-1'))
const person = collections.persons.find((record) => record.familyName === 'Mustermann')
check(collections.persons.filter((record) => record.familyName === 'Mustermann').length === 1, 'Person doppelt angelegt statt verknüpft')
check(JSON.stringify(first?.titles) === JSON.stringify([{ text: { la: 'Testmotette eins' }, type: 'terms:MainTitle' }, { text: { la: 'Testmotette Variante' }, type: 'terms:OtherTitle' }]), `Titel: ${JSON.stringify(first?.titles)}`)
check(JSON.stringify(first?.identifiers) === JSON.stringify([{ list: 'LV', value: '9001' }]), `Nummer: ${JSON.stringify(first?.identifiers)}`)
const agents = ((first?.contributors as Values[] | undefined) ?? []).map((row) => `${row.agent as string}/${row.role as string}`)
check(agents.length === 3 && agents.includes(`${person?.['@id'] as string}/terms:Lyricist`), `Beteiligte: ${agents.join(', ')}`)
check(JSON.stringify(first?.textSources) === '["Psalm 1","Psalm 2"]', `Textprovenienz: ${JSON.stringify(first?.textSources)}`)
check(second?.partOfWork === 'works:9001', `Teil von: ${second?.partOfWork as string}`)
check(find('expressions', 'expressions:9002')?.partOfExpression === 'expressions:9001', 'Fassung ohne Teil-von')
const contents = (source?.contents as Values[] | undefined) ?? []
check(contents.length === 3 && contents[0].embodies === 'expressions:9001' && contents[1].embodies === 'expressions:9002' && contents[2].titleInSource === 'Unbekanntes Stück', `Stücke: ${JSON.stringify(contents)}`)
check(collections.items.some((item) => item.exemplifies === source?.['@id']), 'Handschrift ohne Exemplar')

// Fehler werden mit Zeile und Spalte gemeldet
const bad = importSheets(config, draft, [
  {
    name: 'Werke',
    rows: [
      { number: 1, cells: ['Titel *', 'Verzeichnisnummer: Nummer', 'Teil von', 'Titel: Sprache', 'Quatsch'] },
      { number: 2, cells: [null, '9100', 'gibtsnicht', 'xx', 'egal'] },
      { number: 3, cells: ['A', '9101'] },
      { number: 4, cells: ['B', '9101'] },
    ],
  },
])
const texts = bad.errors.map((issue) => `${issue.row ?? ''} ${issue.column ?? ''} ${issue.text}`)
check(texts.some((text) => text.startsWith('2 Teil von') && text.includes('gibtsnicht')), `Verweis ins Leere nicht gemeldet: ${texts.join(' / ')}`)
check(texts.some((text) => text.startsWith('2 Titel: Sprache')), 'Falsches Sprachkürzel nicht gemeldet')
check(texts.some((text) => text.startsWith('2 ') && text.includes('Es fehlt: Titel')), 'Fehlender Titel nicht gemeldet')
check(texts.some((text) => text.startsWith('4 ') && text.includes('doppelt')), 'Doppelte Nummer nicht gemeldet')
check(bad.notes.some((note) => note.includes('Quatsch')), 'Unbekannte Spalte nicht gemeldet')

if (failures.length > 0) {
  console.error(`Import: ${failures.length} Problem(e)\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log(`Import: alles in Ordnung (${result.total} Datensätze aus der Testdatei, ${sheets.length} Blätter in der Vorlage).`)
