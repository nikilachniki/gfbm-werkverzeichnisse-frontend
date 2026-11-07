// Speichern ins Daten-Repo ueber die GitHub-API, ohne eigenen Server.
//
// Ablauf (siehe README, Abschnitt Baukasten):
// - Jede Person arbeitet in einem eigenen Zweig redaktion/<login>. "Speichern" ist ein
//   Commit dorthin, nie auf main.
// - "Veroeffentlichen" oeffnet einen Pull Request nach main. Die Actions im Daten-Repo
//   pruefen ihn mit validate.py und dem MeLODy-Export.
// - Wer Schreibrechte hat, fuehrt ihn nach gruener Pruefung zusammen; danach entfaellt
//   der Zweig, und die naechste Arbeit beginnt wieder bei main.
//
// Die Rechte prueft GitHub. Der Token ist ein fein granularer Token nur fuer das Daten-Repo
// mit: Contents (lesen und schreiben), Pull requests (lesen und schreiben), Actions (lesen).

import { CONFIG_FILE, DATA_FILES } from './generate.ts'

export interface RemoteTarget {
  owner: string
  repo: string
  // Ordner mit den Datendateien, etwa "data" oder "examples/lasso-schwierig"
  path: string
  // Der veroeffentlichte Stand, meist main
  base: string
}

export interface RemoteState {
  target: RemoteTarget
  login: string
  branch: string
  // Der Commit, auf dem die geoeffneten Dateien beruhen
  head: string
  // Gibt es den Arbeitszweig schon? Sonst entsteht er beim ersten Speichern.
  onBranch: boolean
}

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Der Stand hat sich geaendert, seit die Dateien geoeffnet wurden.
export class ConflictError extends GitHubError {}

const env = import.meta.env ?? {}
const [defaultOwner, defaultRepo] = ((env.VITE_DATA_REPO as string | undefined) ?? 'nikilachniki/gfbm-werkverzeichnisse').split('/')

// Welches Verzeichnis der Editor bearbeitet. Beim Bauen per Umgebungsvariable anpassbar,
// denn jedes Werkverzeichnis hat sein eigenes Daten-Repo.
export const DEFAULT_TARGET: RemoteTarget = {
  owner: defaultOwner,
  repo: defaultRepo,
  path: (env.VITE_DATA_PATH as string | undefined) ?? 'examples/lasso-schwierig',
  base: (env.VITE_DATA_BRANCH as string | undefined) ?? 'main',
}

export const workBranch = (login: string): string => `redaktion/${login.toLowerCase()}`

type Fetch = typeof fetch

export interface Client {
  request: <T>(method: string, url: string, body?: unknown, accept?: string) => Promise<T>
  text: (url: string) => Promise<string>
}

export function createClient(token: string, fetchImpl: Fetch = fetch, base = 'https://api.github.com'): Client {
  const send = async (method: string, url: string, body?: unknown, accept = 'application/vnd.github+json') => {
    const response = await fetchImpl(`${base}${url}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      let message = response.statusText
      try {
        message = ((await response.json()) as { message?: string }).message ?? message
      } catch {
        // Kein JSON in der Fehlermeldung.
      }
      throw new GitHubError(`GitHub: ${message} (${response.status})`, response.status)
    }
    return response
  }
  return {
    request: async <T>(method: string, url: string, body?: unknown, accept?: string) => {
      const response = await send(method, url, body, accept)
      return (response.status === 204 ? undefined : await response.json()) as T
    },
    text: async (url: string) => (await send('GET', url, undefined, 'application/vnd.github.raw+json')).text(),
  }
}

const repoUrl = (target: RemoteTarget) => `/repos/${target.owner}/${target.repo}`
const filePath = (target: RemoteTarget, file: string) => (target.path ? `${target.path.replace(/\/+$/, '')}/${file}` : file)

export async function whoAmI(client: Client): Promise<string> {
  return (await client.request<{ login: string }>('GET', '/user')).login
}

async function branchHead(client: Client, target: RemoteTarget, branch: string): Promise<string | null> {
  try {
    const ref = await client.request<{ object: { sha: string } }>('GET', `${repoUrl(target)}/git/ref/heads/${branch}`)
    return ref.object.sha
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return null
    }
    throw error
  }
}

// Oeffnet den eigenen Arbeitszweig, wenn es ihn gibt, sonst den veroeffentlichten Stand.
// config: baukasten.json, die gemeinsame Einrichtung, falls es sie schon gibt.
export async function openRemote(client: Client, target: RemoteTarget, login: string): Promise<{ files: Record<string, string>; config?: string; state: RemoteState }> {
  const branch = workBranch(login)
  const ownHead = await branchHead(client, target, branch)
  const head = ownHead ?? (await branchHead(client, target, target.base))
  if (!head) {
    throw new GitHubError(`Der Zweig ${target.base} fehlt in ${target.owner}/${target.repo}.`, 404)
  }
  const files: Record<string, string> = {}
  for (const file of DATA_FILES) {
    files[file] = await client.text(`${repoUrl(target)}/contents/${filePath(target, file)}?ref=${head}`)
  }
  let config: string | undefined
  try {
    config = (await client.text(`${repoUrl(target)}/contents/${filePath(target, CONFIG_FILE)}?ref=${head}`)).replace(/\r\n/g, '\n')
  } catch (error) {
    if (!(error instanceof GitHubError && error.status === 404)) {
      throw error
    }
  }
  return { files, config, state: { target, login, branch, head, onBranch: ownHead !== null } }
}

// Ein Commit mit allen geaenderten Dateien auf den Arbeitszweig. Hat sich der Zweig
// inzwischen bewegt, etwa durch einen zweiten Tab, wird nichts ueberschrieben.
export async function saveRemote(client: Client, state: RemoteState, files: Record<string, string>, message: string): Promise<RemoteState> {
  const url = repoUrl(state.target)
  const commit = await client.request<{ tree: { sha: string } }>('GET', `${url}/git/commits/${state.head}`)
  const tree = await client.request<{ sha: string }>('POST', `${url}/git/trees`, {
    base_tree: commit.tree.sha,
    tree: Object.entries(files).map(([file, content]) => ({ path: filePath(state.target, file), mode: '100644', type: 'blob', content })),
  })
  const created = await client.request<{ sha: string }>('POST', `${url}/git/commits`, { message, tree: tree.sha, parents: [state.head] })
  try {
    if (state.onBranch) {
      await client.request('PATCH', `${url}/git/refs/heads/${state.branch}`, { sha: created.sha, force: false })
    } else {
      await client.request('POST', `${url}/git/refs`, { ref: `refs/heads/${state.branch}`, sha: created.sha })
    }
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422) {
      throw new ConflictError('Der Arbeitszweig hat sich seit dem Öffnen geändert, etwa in einem anderen Fenster. Nichts wurde überschrieben.', 422)
    }
    throw error
  }
  return { ...state, head: created.sha, onBranch: true }
}

export interface PullStatus {
  number: number
  url: string
  // null: GitHub rechnet noch
  mergeable: boolean | null
  checks: 'none' | 'pending' | 'success' | 'failure'
}

interface RawPull {
  number: number
  html_url: string
  mergeable: boolean | null
  head: { sha: string }
}

async function openPull(client: Client, state: RemoteState): Promise<RawPull | null> {
  const pulls = await client.request<RawPull[]>('GET', `${repoUrl(state.target)}/pulls?state=open&head=${state.target.owner}:${state.branch}`)
  return pulls[0] ?? null
}

export async function pullStatus(client: Client, state: RemoteState): Promise<PullStatus | null> {
  const listed = await openPull(client, state)
  if (!listed) {
    return null
  }
  // Nur die Einzelabfrage nennt mergeable.
  const pull = await client.request<RawPull>('GET', `${repoUrl(state.target)}/pulls/${listed.number}`)
  const runs = await client.request<{ workflow_runs: { status: string; conclusion: string | null }[] }>(
    'GET',
    `${repoUrl(state.target)}/actions/runs?head_sha=${pull.head.sha}&event=pull_request`,
  )
  const list = runs.workflow_runs
  const checks: PullStatus['checks'] =
    list.length === 0
      ? 'none'
      : list.some((run) => run.status !== 'completed')
        ? 'pending'
        : list.every((run) => run.conclusion === 'success' || run.conclusion === 'skipped')
          ? 'success'
          : 'failure'
  return { number: pull.number, url: pull.html_url, mergeable: pull.mergeable, checks }
}

export async function publish(client: Client, state: RemoteState, title: string, body: string): Promise<PullStatus> {
  if (!state.onBranch) {
    throw new GitHubError('Erst speichern, dann veröffentlichen.', 400)
  }
  if (!(await openPull(client, state))) {
    await client.request('POST', `${repoUrl(state.target)}/pulls`, { title, body, head: state.branch, base: state.target.base })
  }
  return (await pullStatus(client, state))!
}

// Fuehrt den Pull Request als ein Commit nach main und loescht den Arbeitszweig.
export async function mergePull(client: Client, state: RemoteState, number: number): Promise<void> {
  try {
    await client.request('PUT', `${repoUrl(state.target)}/pulls/${number}/merge`, { merge_method: 'squash', sha: state.head })
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 405 || error.status === 409)) {
      throw new ConflictError(
        error.status === 409
          ? 'Der Pull Request enthält inzwischen einen neueren Stand. Bitte neu öffnen.'
          : 'GitHub kann nicht zusammenführen: Die Prüfung fehlt noch, oder jemand hat inzwischen dieselben Stellen veröffentlicht.',
        error.status,
      )
    }
    throw error
  }
  await client.request('DELETE', `${repoUrl(state.target)}/git/refs/heads/${state.branch}`)
}
