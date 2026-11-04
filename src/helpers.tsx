import Link from '@mui/material/Link'
import { Highlight } from './search/Highlight'
import type { TextAuthorLabel } from './catalogueData'

// Kleines Badge-Icon fuer eine Normdaten-Verknuepfung (GND/VIAF), das direkt
// neben dem Namen steht statt den Namen selbst zu verlinken. So bleibt der Name
// reiner Text und beide Verknuepfungen sind unabhaengig voneinander sichtbar.
function AuthorityBadge({ label, href, color }: { label: string; href: string; color: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label === 'GND' ? 'Gemeinsame Normdatei' : 'Virtual International Authority File'}
      title={label === 'GND' ? 'Gemeinsame Normdatei' : 'Virtual International Authority File'}
      onClick={(event) => event.stopPropagation()}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ml: 0.5,
        px: 0.5,
        height: 15,
        minWidth: 15,
        borderRadius: 0.5,
        fontSize: '0.55rem',
        fontWeight: 700,
        lineHeight: 1,
        color: '#fff',
        backgroundColor: color,
        textDecoration: 'none',
        verticalAlign: 'middle',
      }}
    >
      {label}
    </Link>
  )
}

// "Textdichter", wenn nur Textdichter vorkommen, "Textprovenienz", wenn nur
// Textprovenienz vorkommt, sonst die Kombination.
export function authorOrSourceLabel(hasAuthors: boolean, hasSources: boolean): string {
  if (hasAuthors && !hasSources) {
    return 'Textdichter'
  }
  if (hasSources && !hasAuthors) {
    return 'Textprovenienz'
  }
  return 'Textdichter / Textprovenienz'
}

// Jeder Name als Text, daneben GND- bzw. VIAF-Badge, sofern der Datensatz sie
// verlinkt. Die uebrigen Schreibweisen der Person stehen im Tooltip.
export function AuthorOrSourceText({
  authors,
  sources,
  highlight,
}: {
  authors: TextAuthorLabel[]
  sources: string[]
  highlight?: string
}) {
  if (authors.length === 0 && sources.length === 0) {
    return null
  }
  return (
    <>
      {authors.map(({ name, person }, index) => {
        const bareName = name.replace(/\?$/, '')
        const otherNames = person
          ? [person.preferredName, ...person.variantNames].filter((other) => other !== bareName)
          : []
        return (
          <span key={name} title={otherNames.length > 0 ? `Auch: ${otherNames.join(', ')}` : undefined}>
            {index > 0 && ', '}
            <Highlight text={name} query={highlight} />
            {person?.gnd && <AuthorityBadge label="GND" href={person.gnd} color="authority.gnd" />}
            {person?.viaf && <AuthorityBadge label="VIAF" href={person.viaf} color="authority.viaf" />}
          </span>
        )
      })}
      {authors.length > 0 && sources.length > 0 && ' / '}
      <Highlight text={sources.join(', ')} query={highlight} />
    </>
  )
}
