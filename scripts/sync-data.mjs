#!/usr/bin/env node
/**
 * Holt die JSON-LD-Dateien eines Werkverzeichnisses nach src/data/, damit sie beim
 * Vite-Build eingebunden werden koennen. Dieses Repository haelt bewusst keine eigene
 * Kopie der Daten.
 *
 * Die Quelle, das Erste gilt:
 *  1. WV_DATA_DIR zeigt auf einen lokalen Ordner (so bauen auch die Workflows).
 *  2. Mit --dev (npm run dev) das Repo aus .env.development, von GitHub geladen. Damit
 *     zeigt die Website lokal dasselbe Verzeichnis wie die Verwaltung.
 *  3. Der Beispieldatensatz in der Vorlage gfbm-werkverzeichnisse, die als Geschwisterordner
 *     neben diesem Projekt liegt (Branch main). Ein lokaler Ordner mit dem frueheren Namen
 *     lassoDBData wird ebenfalls gefunden.
 *
 * Aufruf:  node scripts/sync-data.mjs [--dev]
 *          WV_DATA_DIR=/pfad/zum/data node scripts/sync-data.mjs
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
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

function fail(...lines) {
  throw new Error(lines.join('\n'))
}

// Das Repo aus .env.development; Variablen aus der Shell gehen der Datei vor.
async function developmentRepo() {
  const { loadEnv } = await import('vite')
  const env = loadEnv('development', projectRoot, 'VITE_DATA_')
  return env.VITE_DATA_REPO ? { repo: env.VITE_DATA_REPO, folder: env.VITE_DATA_PATH ?? '', branch: env.VITE_DATA_BRANCH ?? 'main' } : null
}

const HELP = 'Für einen lokalen Ordner stattdessen WV_DATA_DIR setzen, siehe README.'

async function request(url, description, headers = {}) {
  let response
  try {
    response = await fetch(url, { headers })
  } catch (reason) {
    fail(`${description} ließ sich nicht laden: ${reason.cause?.message ?? reason.message}`, HELP)
  }
  return response
}

// Alle Dateien aus demselben Commit. Die Adresse mit der Commit-Kennung umgeht zudem den
// Zwischenspeicher von GitHub, der sonst bis zu fuenf Minuten alte Staende liefert.
async function readRepo({ repo, folder, branch }) {
  const label = `${repo}@${branch}`
  const head = await request(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, label, { Accept: 'application/vnd.github.sha' })
  if (!head.ok) {
    fail(`${label} ließ sich nicht lesen (HTTP ${head.status}). Stimmen VITE_DATA_REPO und VITE_DATA_BRANCH, und ist das Repo öffentlich?`, HELP)
  }
  const commit = await head.text()
  const prefix = folder.replace(/^\/+|\/+$/g, '')
  const entries = await Promise.all(
    FILES.map(async (file) => {
      const response = await request(`https://raw.githubusercontent.com/${repo}/${commit}/${prefix ? `${prefix}/` : ''}${file}`, `${label}: ${file}`)
      return [file, response.ok ? Buffer.from(await response.arrayBuffer()) : null]
    }),
  )
  const missing = entries.filter(([, content]) => content === null).map(([file]) => file)
  if (missing.length > 0) {
    fail(`In ${label}, Ordner ${prefix || '(Wurzel)'}, fehlen: ${missing.join(', ')}`, HELP)
  }
  return { contents: entries, origin: `${label} (${commit.slice(0, 7)})` }
}

function readFolder(sourceDir) {
  if (!existsSync(sourceDir)) {
    fail(
      `Quellverzeichnis nicht gefunden: ${sourceDir}`,
      'Liegt die Vorlage (gfbm-werkverzeichnisse) als Geschwisterordner neben diesem Projekt, auf dem Branch main?',
      'Alternativ WV_DATA_DIR auf den Datenordner setzen.',
    )
  }
  const missing = FILES.filter((file) => !existsSync(path.join(sourceDir, file)))
  if (missing.length > 0) {
    fail(`In ${sourceDir} fehlen: ${missing.join(', ')}`)
  }
  return { contents: FILES.map((file) => [file, readFileSync(path.join(sourceDir, file))]), origin: sourceDir }
}

// Die Vorlage liegt als Geschwisterordner neben diesem Projekt, unter neuem oder altem Namen.
function templateFolder() {
  const templateDir =
    ['gfbm-werkverzeichnisse', 'lassoDBData'].map((name) => path.resolve(projectRoot, '..', name)).find((folder) => existsSync(folder)) ??
    path.resolve(projectRoot, '..', 'gfbm-werkverzeichnisse')
  return path.resolve(templateDir, 'examples')
}

try {
  const repo = !process.env.WV_DATA_DIR && process.argv.includes('--dev') ? await developmentRepo() : null
  const { contents, origin } = repo ? await readRepo(repo) : readFolder(process.env.WV_DATA_DIR ?? templateFolder())

  // Erst jetzt, damit ein Fehler beim Laden den bisherigen Stand nicht loescht. Neu angelegt,
  // damit keine Dateien eines anderen Verzeichnisses liegen bleiben.
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  for (const [file, content] of contents) {
    writeFileSync(path.join(targetDir, file), content)
  }

  console.log(`${FILES.length} Datendateien übernommen von ${origin}`)
} catch (reason) {
  console.error(reason.message)
  // Kein process.exit: Unter Windows stuerzt Node sonst bei noch offenen Verbindungen ab.
  process.exitCode = 1
}
