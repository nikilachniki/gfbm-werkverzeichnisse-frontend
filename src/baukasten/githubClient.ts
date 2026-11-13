// Der Zugang zur GitHub-API, soweit ihn schon die Anmeldung auf der oeffentlichen Seite
// braucht. Das Lesen und Speichern der Daten steht in github.ts und kommt mit dem Editor
// erst, wenn jemand die Verwaltung oeffnet.

export interface RemoteTarget {
  owner: string
  repo: string
  // Ordner mit den Datendateien, etwa "data" oder "examples"
  path: string
  // Der veroeffentlichte Stand, meist main
  base: string
}

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const env = import.meta.env ?? {}
const [defaultOwner, defaultRepo] = ((env.VITE_DATA_REPO as string | undefined) ?? 'nikilachniki/gfbm-werkverzeichnisse').split('/')

// Welches Verzeichnis der Editor bearbeitet. Beim Bauen per Umgebungsvariable anpassbar,
// denn jedes Werkverzeichnis hat sein eigenes Daten-Repo.
export const DEFAULT_TARGET: RemoteTarget = {
  owner: defaultOwner,
  repo: defaultRepo,
  path: (env.VITE_DATA_PATH as string | undefined) ?? 'examples',
  base: (env.VITE_DATA_BRANCH as string | undefined) ?? 'main',
}

// Alle Projekte eines Kontos liegen unter derselben Adresse (<owner>.github.io) und teilen
// sich damit den Browser-Speicher. Jeder Eintrag traegt deshalb das Projekt im Namen.
export const projectKey = (name: string, target: RemoteTarget = DEFAULT_TARGET): string => `${name}:${target.owner}/${target.repo}/${target.path}`

type Fetch = typeof fetch

export interface Client {
  request: <T>(method: string, url: string, body?: unknown) => Promise<T>
  text: (url: string) => Promise<string>
}

export function createClient(token: string, fetchImpl: Fetch = fetch, base = 'https://api.github.com'): Client {
  const send = async (method: string, url: string, body?: unknown, accept = 'application/vnd.github+json') => {
    const response = await fetchImpl(`${base}${url}`, {
      method,
      // Der Browser wuerde GitHubs Antworten sonst eine Minute lang wiederverwenden.
      cache: 'no-store',
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
    request: async <T>(method: string, url: string, body?: unknown) => {
      const response = await send(method, url, body)
      return (response.status === 204 ? undefined : await response.json()) as T
    },
    text: async (url: string) => (await send('GET', url, undefined, 'application/vnd.github.raw+json')).text(),
  }
}

export async function whoAmI(client: Client): Promise<string> {
  return (await client.request<{ login: string }>('GET', '/user')).login
}
