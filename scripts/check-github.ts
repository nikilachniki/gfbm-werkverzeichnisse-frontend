// Prueft den Ablauf Oeffnen, Speichern, Veroeffentlichen, Zusammenfuehren gegen ein
// nachgebautes GitHub im Speicher. Kein Netz, kein echtes Repo. Aufruf ueber
// npm run check:baukasten.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFiles, changedFiles, CONFIG_FILE, configForDraft, configFromText, configText, DATA_FILES, draftFromFiles, entityUse, setupFiles, usageOf } from '../src/baukasten/generate.ts'
import { ConflictError, createClient, finishSetup, mergePull, openRemote, projectKey, publish, pullStatus, readSetup, saveRemote, whoAmI, type RemoteTarget } from '../src/baukasten/github.ts'
import { configFromPreset, ENTITIES, withEntity } from '../src/baukasten/model.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Die Vorlage liegt als Geschwisterordner neben diesem Projekt, unter neuem oder altem Namen.
const templateDir = process.env.WV_TEMPLATE_DIR ?? ['gfbm-werkverzeichnisse', 'lassoDBData'].map((name) => path.resolve(root, '..', name)).find((folder) => existsSync(folder)) ?? path.resolve(root, '..', 'gfbm-werkverzeichnisse')
const dataRepo = templateDir
const folder = 'examples/lasso-schwierig'

const failures: string[] = []
const check = (condition: boolean, message: string) => {
  if (!condition) {
    failures.push(message)
  }
}

// --- Ein kleines GitHub: Commits mit vollstaendigem Dateibaum, Zweige, Pull Requests. ---
type Tree = Record<string, string>
const commits = new Map<string, { tree: string; parents: string[] }>()
const trees = new Map<string, Tree>()
const refs = new Map<string, string>()
const pulls: { number: number; head: string; base: string; open: boolean }[] = []
const runs = new Map<string, { status: string; conclusion: string | null }[]>()
let counter = 0
const newSha = () => `sha${(counter += 1)}`

const initialTree: Tree = Object.fromEntries(DATA_FILES.map((file) => [`${folder}/${file}`, readFileSync(path.join(dataRepo, folder, file), 'utf8').replace(/\r\n/g, '\n')]))
trees.set('t0', initialTree)
commits.set('c0', { tree: 't0', parents: [] })
refs.set('main', 'c0')

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  const route = url.pathname.replace('/repos/owner/daten', '')
  if (route === '/user') {
    return json(200, { login: 'Redakteurin' })
  }
  let match = route.match(/^\/git\/ref\/heads\/(.+)$/)
  if (match && method === 'GET') {
    const sha = refs.get(match[1])
    return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' })
  }
  match = route.match(/^\/contents\/(.+)$/)
  if (match) {
    const tree = trees.get(commits.get(url.searchParams.get('ref')!)!.tree)!
    const content = tree[decodeURIComponent(match[1])]
    return content === undefined ? json(404, { message: 'Not Found' }) : new Response(content, { status: 200 })
  }
  match = route.match(/^\/git\/commits\/(.+)$/)
  if (match) {
    return json(200, { tree: { sha: commits.get(match[1])!.tree } })
  }
  if (route === '/git/trees' && method === 'POST') {
    const sha = newSha()
    trees.set(sha, { ...trees.get(body.base_tree)!, ...Object.fromEntries(body.tree.map((entry: { path: string; content: string }) => [entry.path, entry.content])) })
    return json(201, { sha })
  }
  if (route === '/git/commits' && method === 'POST') {
    const sha = newSha()
    commits.set(sha, { tree: body.tree, parents: body.parents })
    return json(201, { sha })
  }
  if (route === '/git/refs' && method === 'POST') {
    const name = body.ref.slice('refs/heads/'.length)
    if (refs.has(name)) {
      return json(422, { message: 'Reference already exists' })
    }
    refs.set(name, body.sha)
    return json(201, {})
  }
  match = route.match(/^\/git\/refs\/heads\/(.+)$/)
  if (match && method === 'PATCH') {
    // Nur vorwaerts: der neue Commit muss auf dem aktuellen Stand aufsetzen.
    if (!commits.get(body.sha)!.parents.includes(refs.get(match[1])!)) {
      return json(422, { message: 'Update is not a fast forward' })
    }
    refs.set(match[1], body.sha)
    return json(200, {})
  }
  if (match && method === 'DELETE') {
    refs.delete(match[1])
    return new Response(null, { status: 204 })
  }
  if (route === '/pulls' && method === 'GET') {
    const head = url.searchParams.get('head')!.split(':')[1]
    return json(200, pulls.filter((pull) => pull.open && pull.head === head).map((pull) => ({ number: pull.number, html_url: `https://example.org/pull/${pull.number}`, mergeable: null, head: { sha: refs.get(pull.head) } })))
  }
  if (route === '/pulls' && method === 'POST') {
    pulls.push({ number: pulls.length + 1, head: body.head, base: body.base, open: true })
    return json(201, {})
  }
  match = route.match(/^\/pulls\/(\d+)$/)
  if (match) {
    const pull = pulls[Number(match[1]) - 1]
    return json(200, { number: pull.number, html_url: `https://example.org/pull/${pull.number}`, mergeable: true, head: { sha: refs.get(pull.head) } })
  }
  if (route === '/actions/runs') {
    return json(200, { workflow_runs: runs.get(url.searchParams.get('head_sha')!) ?? [] })
  }
  match = route.match(/^\/pulls\/(\d+)\/merge$/)
  if (match && method === 'PUT') {
    const pull = pulls[Number(match[1]) - 1]
    if (refs.get(pull.head) !== body.sha) {
      return json(409, { message: 'Head branch was modified' })
    }
    const sha = newSha()
    commits.set(sha, { tree: commits.get(refs.get(pull.head)!)!.tree, parents: [refs.get(pull.base)!] })
    refs.set(pull.base, sha)
    pull.open = false
    return json(200, { merged: true })
  }
  return json(404, { message: `Nicht nachgebaut: ${method} ${route}` })
}) as typeof fetch

const fileOn = (branch: string, file: string) => trees.get(commits.get(refs.get(branch)!)!.tree)![`${folder}/${file}`]

// --- Der Ablauf ---
const target: RemoteTarget = { owner: 'owner', repo: 'daten', path: folder, base: 'main' }
const client = createClient('token', fakeFetch, 'https://api.example')
const login = await whoAmI(client)

// 1. Erstes Oeffnen: es gibt noch keinen Arbeitszweig, also main.
const first = await openRemote(client, target, login)
check(!first.state.onBranch && first.state.branch === 'redaktion/redakteurin', 'Erstes Öffnen soll von main lesen und den Zweig redaktion/<login> vorsehen')
const draft = draftFromFiles(first.files, folder, first.state)
const config = configForDraft(configFromPreset('lasso'), draft)
// Ohne baukasten.json im Repo ist nur die Einrichtung neu, die Daten sind unveraendert.
check(JSON.stringify(changedFiles(config, draft)) === JSON.stringify([CONFIG_FILE]), `Frisch geöffnet ist schon etwas geändert: ${changedFiles(config, draft).join(', ')}`)
// Mit gespeicherter Einrichtung ist nach dem Oeffnen gar nichts geaendert.
const withConfig = draftFromFiles(first.files, folder, first.state, configText(config))
check(changedFiles(configForDraft(configFromText(configText(config)), withConfig), withConfig).length === 0, 'Eine gespeicherte Einrichtung gilt nach dem Öffnen als geändert')

// 2. Ein Titel wird geaendert und gespeichert: nur auf dem Arbeitszweig, main bleibt.
const titles = structuredClone(draft.works[0].values.titles) as { text: Record<string, string> }[]
const language = Object.keys(titles[0].text)[0]
titles[0].text[language] += ' (geändert)'
draft.works[0].values.titles = titles
const changed = changedFiles(config, draft)
const built: Record<string, string> = { ...buildFiles(config, draft), [CONFIG_FILE]: configText(config) }
const saved = await saveRemote(client, first.state, Object.fromEntries(changed.map((file) => [file, built[file]])), 'Titel geändert')
check(saved.onBranch && refs.get('redaktion/redakteurin') === saved.head, 'Speichern legt den Arbeitszweig nicht an')
check(fileOn('main', 'works.json') === first.files['works.json'], 'Speichern hat main verändert')
check(fileOn('redaktion/redakteurin', 'works.json').includes('(geändert)'), 'Die Änderung fehlt im Arbeitszweig')
check(fileOn('redaktion/redakteurin', 'persons.json') === first.files['persons.json'], 'Unveränderte Dateien haben sich verändert')
check(fileOn('redaktion/redakteurin', CONFIG_FILE) === configText(config), 'Die Einrichtung fehlt im Arbeitszweig')

// 3. Erneutes Oeffnen setzt im Arbeitszweig fort.
const again = await openRemote(client, target, login)
check(again.state.onBranch && again.files['works.json'].includes('(geändert)'), 'Erneutes Öffnen liest nicht den Arbeitszweig')

// 4. Speichern auf veraltetem Stand ueberschreibt nichts.
let conflict = false
try {
  await saveRemote(client, first.state, { 'works.json': first.files['works.json'] }, 'veraltet')
} catch (error) {
  conflict = error instanceof ConflictError
}
check(conflict, 'Speichern auf veraltetem Stand meldet keinen Konflikt')
check(fileOn('redaktion/redakteurin', 'works.json').includes('(geändert)'), 'Ein veralteter Stand hat den Arbeitszweig überschrieben')

// 5. Veroeffentlichen: ein Pull Request, die Pruefung laeuft, dann Zusammenfuehren.
const status = await publish(client, saved, 'Titel geändert', 'Aus dem Baukasten')
check(status.number === 1 && status.checks === 'none', 'Veröffentlichen legt keinen Pull Request an')
check((await publish(client, saved, 'nochmal', '')).number === 1, 'Zweites Veröffentlichen legt einen zweiten Pull Request an')
runs.set(saved.head, [{ status: 'in_progress', conclusion: null }])
check((await pullStatus(client, saved))?.checks === 'pending', 'Laufende Prüfung wird nicht erkannt')
runs.set(saved.head, [{ status: 'completed', conclusion: 'failure' }])
check((await pullStatus(client, saved))?.checks === 'failure', 'Fehlgeschlagene Prüfung wird nicht erkannt')
runs.set(saved.head, [{ status: 'completed', conclusion: 'success' }])
check((await pullStatus(client, saved))?.checks === 'success', 'Grüne Prüfung wird nicht erkannt')
await mergePull(client, saved, status.number)
check(fileOn('main', 'works.json').includes('(geändert)'), 'Nach dem Zusammenführen fehlt die Änderung auf main')
check(!refs.has('redaktion/redakteurin'), 'Der Arbeitszweig bleibt nach dem Zusammenführen stehen')

// 6. Danach beginnt die naechste Arbeit wieder bei main.
const fresh = await openRemote(client, target, login)
check(!fresh.state.onBranch && fresh.files['works.json'].includes('(geändert)'), 'Nach dem Zusammenführen beginnt die Arbeit nicht bei main')

// 7. Einrichtung abschliessen: Ohne baukasten.json auf main ist das Verzeichnis nicht
// eingerichtet. Das Abschliessen schreibt sie direkt nach main und laesst Daten in Ruhe.
const mainTree = { ...trees.get(commits.get(refs.get('main')!)!.tree)! }
delete mainTree[`${folder}/${CONFIG_FILE}`]
trees.set('ohne-einrichtung', mainTree)
commits.set('c-ohne-einrichtung', { tree: 'ohne-einrichtung', parents: [refs.get('main')!] })
refs.set('main', 'c-ohne-einrichtung')
check((await readSetup(client, target)) === null, 'Ein Verzeichnis ohne baukasten.json gilt als eingerichtet')

const worksBefore = fileOn('main', 'works.json')
const wizard = { ...configFromPreset('lasso'), catalogue: { label: 'Neuer Name', abbreviation: 'NN', composer: 'Lasso, Orlando di' } }
const setupText = await finishSetup(client, target, login, wizard)
check((await readSetup(client, target)) === setupText, 'Nach dem Abschließen fehlt die Einrichtung auf main')
check(fileOn('main', 'works.json') === worksBefore, 'Das Abschließen hat Daten verändert')
check((JSON.parse(fileOn('main', 'catalog.json')) as { label: string }).label === 'Neuer Name', 'Das Abschließen übernimmt den Namen nicht')

let finishedTwice = false
try {
  await finishSetup(client, target, login, wizard)
} catch (error) {
  finishedTwice = error instanceof ConflictError
}
check(finishedTwice, 'Zweites Abschließen meldet keinen Konflikt')

// Nach dem Oeffnen eines eingerichteten Verzeichnisses ist nichts geaendert.
const finished = await openRemote(client, target, login)
const finishedDraft = draftFromFiles(finished.files, folder, finished.state, finished.config)
const finishedConfig = configForDraft(configFromText(finished.config!), finishedDraft)
finishedDraft.source!.config = configText(finishedConfig)
check(changedFiles(finishedConfig, finishedDraft).length === 0, `Frisch eingerichtet ist schon etwas geändert: ${changedFiles(finishedConfig, finishedDraft).join(', ')}`)

// 7b. Einrichtung nachtraeglich aendern: Daten bleiben Byte fuer Byte, nur baukasten.json aendert sich.
const usage = usageOf(finishedDraft)
const everythingOn = structuredClone(finishedConfig)
for (const entity of ENTITIES) {
  everythingOn.entities[entity.key] = true
  for (const field of entity.fields) {
    everythingOn.fields[`${entity.key}.${field.key}`] = true
  }
}
check(JSON.stringify(changedFiles(everythingOn, finishedDraft)) === JSON.stringify([CONFIG_FILE]), `Alles einschalten ändert: ${changedFiles(everythingOn, finishedDraft).join(', ')}`)
const unused = ENTITIES.flatMap((entity) => entity.fields.filter((field) => !field.required && !usage.fields[`${entity.key}.${field.key}`]).map((field) => `${entity.key}.${field.key}`))
check(unused.length > 0, 'Für die Prüfung fehlt ein unbenutztes Feld')
const fewer = { ...finishedConfig, fields: { ...finishedConfig.fields, ...Object.fromEntries(unused.map((key) => [key, false])) } }
const fewerChanged = changedFiles(fewer, finishedDraft)
check(fewerChanged.every((file) => file === CONFIG_FILE), `Unbenutzte Felder abschalten ändert: ${fewerChanged.join(', ')}`)

// Gesperrt ist genau, was das Oeffnen wieder einschalten wuerde.
const reopened = configForDraft({ ...fewer, entities: Object.fromEntries(ENTITIES.map((entity) => [entity.key, false])) as typeof fewer.entities }, finishedDraft)
for (const [key] of Object.entries(usage.fields)) {
  check(Boolean(reopened.fields[key]), `${key} ist gesperrt, wird beim Öffnen aber nicht eingeschaltet`)
}
for (const entity of ENTITIES) {
  check(usage.entities[entity.key] === 0 || reopened.entities[entity.key], `${entity.key} hat Daten, wird beim Öffnen aber nicht eingeschaltet`)
}
// Quellen mit Exemplaren lassen sich nicht abschalten, und das Schalten folgt den Abhaengigkeiten.
check(entityUse(usage, 'manifestations') >= usage.entities.manifestations + usage.entities.items, 'Exemplare zählen nicht zu ihren Quellen')
check(!withEntity(finishedConfig, 'manifestations', false).entities.items, 'Ohne Quellen bleiben Exemplare eingeschaltet')

// 8. Abschliessen auf der leeren Vorlage: nur Name, Komponist*in und Einrichtung aendern sich.
const starter = Object.fromEntries(DATA_FILES.map((file) => [file, readFileSync(path.join(dataRepo, 'data', file), 'utf8')]))
const starterFiles = Object.keys(setupFiles(wizard, starter, finished.state)).sort()
check(JSON.stringify(starterFiles) === JSON.stringify([CONFIG_FILE, 'catalog.json', 'persons.json']), `Abschließen der leeren Vorlage schreibt: ${starterFiles.join(', ')}`)

// 9. Der Browser-Speicher ist je Projekt getrennt.
check(projectKey('wv', target) !== projectKey('wv', { ...target, repo: 'anderes' }), 'Zwei Projekte teilen sich den Browser-Speicher')

if (failures.length > 0) {
  console.error(`\n${failures.length} Fehler im GitHub-Ablauf:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log('GitHub-Ablauf: Öffnen, Speichern, Konflikt, Veröffentlichen, Zusammenführen, Einrichtung stimmen.')
