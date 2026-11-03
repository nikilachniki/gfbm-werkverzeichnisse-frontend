#!/usr/bin/env node
/**
 * Kopiert die erzeugten JSON-LD-Dateien aus dem Datenrepository lassoDBData
 * nach src/data/, damit sie beim Vite-Build eingebunden werden koennen.
 *
 * Dieses Projekt haelt bewusst keine eigene Kopie der Daten im Repository,
 * siehe docs/entscheidungen.md in lassoDBData, Abschnitt 1. Die Quelle wird
 * stattdessen bei jedem Build frisch geholt:
 *
 *   - lokal zeigt die Quelle per Default auf ../lassoDBData/data, geht also
 *     davon aus, dass beide Repositories nebeneinander ausgecheckt sind.
 *   - in der GitHub Action wird LASSO_DATA_DIR gesetzt, weil der Checkout
 *     der zweiten Quelle dort in einen anderen Pfad gelegt wird.
 *
 * Aufruf:  node scripts/sync-data.mjs
 *          LASSO_DATA_DIR=/pfad/zu/lassoDBData/data node scripts/sync-data.mjs
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')

const sourceDir =
  process.env.LASSO_DATA_DIR ?? path.resolve(projectRoot, '..', 'lassoDBData', 'data')
const targetDir = path.resolve(projectRoot, 'src', 'data')

const FILES = [
  'entries.json',
  'manuscripts.json',
  'works.json',
  'expressions.json',
  'prints.json',
  'persons.json',
  'editions.json',
]

if (!existsSync(sourceDir)) {
  console.error(`Quellverzeichnis nicht gefunden: ${sourceDir}`)
  console.error('Liegt lassoDBData als Geschwisterordner neben diesem Projekt?')
  console.error('Alternativ LASSO_DATA_DIR auf den data/-Ordner setzen.')
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })

let copied = 0
for (const file of FILES) {
  const from = path.join(sourceDir, file)
  if (!existsSync(from)) {
    console.warn(`  uebersprungen, fehlt in der Quelle: ${file}`)
    continue
  }
  copyFileSync(from, path.join(targetDir, file))
  copied += 1
}

console.log(`${copied} Datendateien kopiert von ${sourceDir}`)
console.log(`  nach ${targetDir}`)
