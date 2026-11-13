// Volltextsuche fuer Werke und Drucke. Die Eingabe wird in Woerter zerlegt,
// jedes Wort muss irgendwo im Datensatz vorkommen, die Reihenfolge ist egal.
// Verglichen wird auf beiden Seiten in derselben vereinheitlichten Form (fold):
// ohne Akzente und Satzzeichen, lateinische Schreibvarianten angeglichen.
// Ein Suchwort trifft ein Wort im Datensatz
//   - genau (1),
//   - als Zahl: "primus", "1." und "I" sind gleich, nur in Titelfeldern (0.9),
//   - als Wortanfang: "psalm" trifft "psalmus" (0.8),
//   - mit Tippfehler: bei langen Woertern 1 bzw. 2 abweichende Zeichen (0.5),
//     auch am Wortanfang, damit ein halb getipptes Wort mit Fehler trifft (0.4).
// Die Punktzahl eines Datensatzes ist die Summe der besten Treffer je Suchwort,
// gewichtet nach Feld; danach sortieren die Tabellen bei aktiver Suche.
// Highlight markiert nach denselben Regeln, siehe termMatchesWord.

// Diplomatische Titelblaetter trennen am Zeilenende mit "=|" ("Can=|tiones").
const LINE_BREAK_HYPHEN = /=\s*\|\s*/g

function fold(text: string): string {
  return text
    .replace(LINE_BREAK_HYPHEN, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/j/g, 'i')
    .replace(/y/g, 'i')
    .replace(/v/g, 'u')
    .replace(/ae/g, 'e')
    .replace(/oe/g, 'e')
    // gratia/gracia, tertius/tercius
    .replace(/ci(?=[aeou])/g, 'ti')
}

const WORD = /[\p{L}\p{N}]+/gu

function tokenize(text: string): string[] {
  return fold(text).match(WORD) ?? []
}

// Ordnungszahlen als Zahl. Die Schluessel werden mit fold vereinheitlicht wie
// die Woerter, mit denen sie verglichen werden ("octavus" -> "octauus").
const ORDINALS: Record<number, string[]> = {
  1: ['prim', 'erst'],
  2: ['secund', 'zweit', 'second'],
  3: ['terti', 'dritt', 'terz'],
  4: ['quart', 'viert'],
  5: ['quint', 'fünft'],
  6: ['sext', 'sechst', 'sest'],
  7: ['septim', 'siebt', 'settim'],
  8: ['octav', 'acht', 'ottav'],
  9: ['non', 'neunt'],
  10: ['decim', 'zehnt'],
}
const ORDINAL_ENDINGS = ['us', 'a', 'um', 'i', 'ae', 'o', 'am', 'is', 'e', 'er', 'es', 'en']
// Roemische Zahlen erst ab II: "i", "v", "vi" und "x" sind auch Woerter.
const ROMAN: Record<string, number> = { ii: 2, iii: 3, iv: 4, vii: 7, viii: 8, ix: 9, xi: 11, xii: 12 }

const NUMBER_WORDS = new Map<string, number>()
for (const [value, stems] of Object.entries(ORDINALS)) {
  for (const stem of stems) {
    for (const ending of ORDINAL_ENDINGS) {
      NUMBER_WORDS.set(fold(stem + ending), Number(value))
    }
  }
}
// Mehrdeutige Woerter ("secundum", "achten") treffen sich selbst weiterhin
// genau und damit hoeher als die Zahl.
for (const [roman, value] of Object.entries(ROMAN)) {
  NUMBER_WORDS.set(fold(roman), value)
}

function numberValue(token: string): number | null {
  if (/^\d+$/.test(token)) {
    return Number(token)
  }
  return NUMBER_WORDS.get(token) ?? null
}

// Levenshtein-Distanz, abgebrochen sobald sie max uebersteigt
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      rowMin = Math.min(rowMin, current[j])
    }
    if (rowMin > max) {
      return max + 1
    }
    previous = current
  }
  return previous[b.length]
}

function allowedTypos(term: string): number {
  if (!/^\p{L}+$/u.test(term)) {
    return 0
  }
  return term.length >= 8 ? 2 : term.length >= 5 ? 1 : 0
}

interface Term {
  token: string
  number: number | null
  typos: number
  // Ergebnis je Datensatzwort, weil dieselben Woerter in vielen Datensaetzen stehen
  cache: Map<string, number>
}

export interface SearchQuery {
  folded: string
  terms: Term[]
}

export function parseQuery(query: string): SearchQuery | null {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return null
  }
  return {
    folded: fold(query.trim()),
    terms: Array.from(new Set(tokens)).map((token) => ({
      token,
      number: numberValue(token),
      typos: allowedTypos(token),
      cache: new Map(),
    })),
  }
}

function matchQuality(term: Term, token: string, numbers: boolean): number {
  const key = numbers ? token : `#${token}`
  const cached = term.cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  let quality = 0
  if (token === term.token) {
    quality = 1
  } else if (numbers && term.number !== null && numberValue(token) === term.number) {
    quality = 0.9
  } else if (/^\d+$/.test(term.token)) {
    // Zahlen nur genau: "1" soll nicht "1555" treffen
    quality = 0
  } else if (term.token.length >= 2 && token.startsWith(term.token)) {
    quality = 0.8
  } else if (term.typos > 0) {
    if (editDistance(term.token, token, term.typos) <= term.typos) {
      quality = 0.5
    } else if (
      token.length > term.token.length &&
      editDistance(term.token, token.slice(0, term.token.length), term.typos) <= term.typos
    ) {
      quality = 0.4
    }
  }
  term.cache.set(key, quality)
  return quality
}

// Ein Feld eines Datensatzes. weight hebt etwa den Titel ueber die Sprache;
// numbers erlaubt den Zahlenvergleich ("primus" = "1."), aber nur dort, wo
// Zahlen Ordnungszahlen sind, nicht bei LV-Nummern oder Sigeln.
export interface SearchField {
  text: string
  weight?: number
  numbers?: boolean
}

export interface SearchDocument {
  folded: string
  fields: { tokens: string[]; weight: number; numbers: boolean }[]
}

export function indexDocument(fields: SearchField[]): SearchDocument {
  return {
    folded: fields.map((field) => fold(field.text)).join(' '),
    fields: fields
      .filter((field) => field.text)
      .map((field) => ({
        tokens: Array.from(new Set(tokenize(field.text))),
        weight: field.weight ?? 1,
        numbers: field.numbers ?? false,
      })),
  }
}

// 0, wenn nicht jedes Suchwort trifft. Die Eingabe als Ganzes ("1555-1",
// "LV 100-2") trifft wie bisher auch als Zeichenfolge mitten im Text, aber
// schwaecher als Wort fuer Wort: "100-2" zuerst LV 100-2, dann LV 1100-2.
export function scoreDocument(document: SearchDocument, query: SearchQuery): number {
  let score = 0
  for (const term of query.terms) {
    let best = 0
    for (const field of document.fields) {
      for (const token of field.tokens) {
        const quality = matchQuality(term, token, field.numbers) * field.weight
        if (quality > best) {
          best = quality
        }
      }
    }
    if (best === 0) {
      return document.folded.includes(query.folded) ? query.terms.length / 2 : 0
    }
    score += best
  }
  return score
}

// Fuer die Markierung: trifft ein Suchwort dieses Wort des angezeigten Texts?
export function termMatchesWord(query: SearchQuery, word: string): boolean {
  const tokens = tokenize(word)
  return tokens.some((token) => query.terms.some((term) => matchQuality(term, token, true) > 0))
}
