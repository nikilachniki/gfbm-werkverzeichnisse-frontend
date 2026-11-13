// Die Excel-Seite des Imports: Vorlage schreiben, ausgefuellte Datei lesen. exceljs ist gross
// und wird darum erst geladen, wenn jemand es braucht.

import type { DataValidation } from 'exceljs'
import type { Cell, Column, SheetDef, SheetInput } from './importSheets.ts'

type ExcelModule = typeof import('exceljs')

async function loadExcel(): Promise<ExcelModule> {
  const module = await import('exceljs')
  // Das Paket ist im Browser ein UMD-Buendel; je nach Umgebung steckt es in default.
  return (module as unknown as { default?: ExcelModule }).default ?? module
}

// Bis hierhin gelten Auswahllisten und Formate in der Vorlage.
const TEMPLATE_ROWS = 2000

const FILL = {
  required: 'FFFCE4CC',
  list: 'FFDDEFD9',
  row: 'FFD9E7F5',
  plain: 'FFEDEDED',
}

function fillOf(column: Column): string {
  if (column.required) {
    return FILL.required
  }
  return column.multi === 'list' ? FILL.list : column.multi === 'row' ? FILL.row : FILL.plain
}

function guideLines(label: string, sheets: SheetDef[]): { text: string; style?: 'title' | 'heading' }[] {
  return [
    { text: `Import-Vorlage: ${label || 'Werkverzeichnis'}`, style: 'title' },
    { text: '' },
    { text: 'So wird ausgefüllt', style: 'heading' },
    { text: '• Jedes Blatt steht für einen Datentyp, jede Zeile für einen neuen Datensatz. Die Spaltennamen in der ersten Zeile bitte nicht ändern. Leere Spalten dürfen gelöscht werden.' },
    { text: '• Orange Spalten (mit *) sind Pflicht. Ein Kommentar an jedem Spaltenkopf erklärt das Feld.' },
    { text: '• Grüne Spalten nehmen mehrere Werte auf, mit Semikolon getrennt, etwa: Psalm 150; Psalm 151' },
    { text: '• Blaue Spalten nehmen einen Eintrag pro Zeile. Weitere Einträge, etwa mehrere Beteiligte oder die Stücke einer Quelle, kommen in die Zeilen darunter. Dort bleiben alle grauen und orangen Spalten leer.' },
    { text: '• Verweise auf andere Datensätze gehen über Name, Verzeichnisnummer, Sigle oder ID. Personen, Orte, Institutionen, Besetzungen und Literatur, die es noch nicht gibt, werden beim Import angelegt.' },
    { text: '• Was es schon gibt (gleiche Verzeichnisnummer, gleiche Sigle oder gleicher Name), wird übersprungen und nicht verändert.' },
    { text: '• Bei Werken stehen die Angaben zur ersten Fassung in den Spalten „Fassung: …“.' },
    { text: '• Datumsangaben als JJJJ-MM-TT, etwa 1585-03-01.' },
    { text: '' },
    { text: 'Hochladen', style: 'heading' },
    { text: 'In der Verwaltung unter „Import“. Vor dem Übernehmen zeigt eine Vorschau, was entsteht und was noch nicht passt. Gespeichert wird danach wie gewohnt mit „Nach GitHub speichern“.' },
    { text: '' },
    { text: 'Die Blätter', style: 'heading' },
    ...sheets.map((sheet) => ({ text: `• ${sheet.name}: ${sheet.blurb}` })),
  ]
}

export async function templateFile(label: string, sheets: SheetDef[]): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Werkverzeichnis-Baukasten'

  const guide = workbook.addWorksheet('Anleitung')
  guide.getColumn(1).width = 120
  for (const line of guideLines(label, sheets)) {
    const row = guide.addRow([line.text])
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    if (line.style) {
      row.font = { bold: true, size: line.style === 'title' ? 14 : 12 }
    }
  }

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    sheet.columns.forEach((column, index) => {
      const excelColumn = worksheet.getColumn(index + 1)
      excelColumn.width = Math.min(42, Math.max(14, column.header.length + 4))
      // Als Text, damit Excel aus 1560-4 kein Datum und aus 007 keine 7 macht.
      excelColumn.numFmt = column.format === 'text' ? '@' : column.format === 'date' ? 'yyyy-mm-dd' : 'General'
      const cell = worksheet.getRow(1).getCell(index + 1)
      cell.value = column.required ? `${column.header} *` : column.header
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillOf(column) } }
      cell.alignment = { wrapText: true, vertical: 'middle' }
      cell.note = column.help
      if (column.options) {
        const letter = excelColumn.letter
        // Gibt es in exceljs, fehlt aber in dessen Typen.
        const validations = (worksheet as unknown as { dataValidations: { add: (range: string, validation: DataValidation) => void } }).dataValidations
        validations.add(`${letter}2:${letter}${TEMPLATE_ROWS}`, {
          type: 'list',
          allowBlank: true,
          formulae: [`"${column.options.join(',')}"`],
          showErrorMessage: column.strict,
          errorStyle: 'stop',
          errorTitle: 'Nicht in der Auswahl',
          error: `Erlaubt: ${column.options.join(', ')}`,
        })
      }
    })
    worksheet.getRow(1).height = 32
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function cellOf(value: unknown): Cell {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return value
  }
  if (typeof value === 'boolean') {
    return value ? 'ja' : 'nein'
  }
  if (typeof value === 'object') {
    const object = value as { richText?: { text: string }[]; text?: unknown; hyperlink?: string; result?: unknown; error?: unknown }
    if (object.richText) {
      return object.richText.map((part) => part.text).join('')
    }
    if (object.hyperlink !== undefined) {
      const text = cellOf(object.text)
      // Ein Link mit sprechendem Text: gemeint ist die Adresse.
      return typeof text === 'string' && /^https?:/.test(text) ? text : object.hyperlink
    }
    if ('result' in object) {
      return cellOf(object.result)
    }
    if (object.text !== undefined) {
      return cellOf(object.text)
    }
  }
  return null
}

export async function readWorkbook(file: File): Promise<SheetInput[]> {
  const ExcelJS = await loadExcel()
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new Error('Die Datei ließ sich nicht als Excel-Tabelle (.xlsx) lesen.')
  }
  return workbook.worksheets.map((worksheet) => {
    const rows: SheetInput['rows'] = []
    worksheet.eachRow({ includeEmpty: false }, (row, number) => {
      const cells: Cell[] = []
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        cells[column - 1] = cellOf(cell.value)
      })
      rows.push({ number, cells: Array.from(cells, (cell) => cell ?? null) })
    })
    return { name: worksheet.name, rows }
  })
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
