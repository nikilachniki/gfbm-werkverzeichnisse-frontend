#!/usr/bin/env node
/**
 * Kopiert die JSON-LD-Dateien eines Werkverzeichnisses nach src/data/, damit sie
 * beim Vite-Build eingebunden werden koennen. Dieses Repository haelt bewusst keine
 * eigene Kopie der Daten.
 *
 * Der Standard zeigt auf einen Beispieldatensatz in lassoDBData, das als
 * Geschwisterordner neben diesem Projekt liegt (Branch werkverzeichnis-vorlage).
 * Fuer ein echtes Verzeichnis zeigt WV_DATA_DIR auf dessen data/-Ordner.
 *
 * Aufruf:  node scripts/sync-data.mjs
 *          WV_DATA_DIR=/pfad/zum/data node scripts/sync-data.mjs
 */

import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')

const sourceDir =
  process.env.WV_DATA_DIR ?? path.resolve(projectRoot, '..', 'lassoDBData', 'examples', 'lasso-schwierig')
const targetDir = path.resolve(projectRoot, 'src', 'data')

const FILES = [
  'catalog.json',
  'works.json',
  'expressions.json',
  'manifestations.json',
  'items.json',
  'persons.json',
  'institutions.json',
  'places.json',
  'instrumentations.json',
  'bibliography.json',
]

if (!existsSync(sourceDir)) {
  console.error(`Quellverzeichnis nicht gefunden: ${sourceDir}`)
  console.error('Liegt lassoDBData als Geschwisterordner neben diesem Projekt, auf dem Branch werkverzeichnis-vorlage?')
  console.error('Alternativ WV_DATA_DIR auf den Datenordner setzen.')
  process.exit(1)
}

const missing = FILES.filter((file) => !existsSync(path.join(sourceDir, file)))
if (missing.length > 0) {
  console.error(`In ${sourceDir} fehlen: ${missing.join(', ')}`)
  process.exit(1)
}

// Neu angelegt, damit keine Dateien eines anderen Verzeichnisses liegen bleiben.
rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
for (const file of FILES) {
  copyFileSync(path.join(sourceDir, file), path.join(targetDir, file))
}

console.log(`${FILES.length} Datendateien kopiert von ${sourceDir}`)
