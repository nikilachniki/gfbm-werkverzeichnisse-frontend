import type { GridColumnVisibilityModel } from '@mui/x-data-grid'

// Spalten, in denen bei keinem Eintrag etwas steht, starten ausgeblendet. Ein Verzeichnis
// ohne Quellen etwa zeigt dann keine leeren Spalten "Drucke" und "Handschriften". Ueber
// "Spalten" lassen sie sich wieder einblenden.
export function hideEmptyColumns<T extends Record<string, unknown>>(rows: T[], fields: (keyof T & string)[]): GridColumnVisibilityModel {
  const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  return Object.fromEntries(fields.filter((field) => rows.every((row) => isEmpty(row[field]))).map((field) => [field, false]))
}
