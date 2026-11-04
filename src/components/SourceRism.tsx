import Link from '@mui/material/Link'
import Tooltip from '@mui/material/Tooltip'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { Source } from '../types.ts'
import { ExternalChip } from './ExternalChip.tsx'

const rismTooltip = (source: Source) => `RISM ${source.rismLabel ?? ''} – in RISM Online öffnen`.replace('  ', ' ')

// Abzeichen "RISM", das die Quelle in RISM Online oeffnet, fuer Tabellen. Auf den
// Detailseiten steht stattdessen SourceRism. Ohne Link nichts.
export function RismBadge({ source }: { source: Source }) {
  if (!source.rismUrl) {
    return null
  }
  return (
    <Tooltip title={rismTooltip(source)}>
      <Link
        href={source.rismUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="In RISM Online öffnen"
        onClick={(event) => event.stopPropagation()}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.25,
          px: 0.75,
          height: 20,
          borderRadius: 0.75,
          fontSize: '0.7rem',
          fontWeight: 700,
          lineHeight: 1,
          color: '#fff',
          backgroundColor: 'authority.rism',
          textDecoration: 'none',
          verticalAlign: 'middle',
          flexShrink: 0,
          '&:hover': { filter: 'brightness(1.15)' },
        }}
      >
        RISM
        <OpenInNewIcon sx={{ fontSize: 12 }} />
      </Link>
    </Tooltip>
  )
}

// RISM-Angabe als Wert der Detailseiten: die Nummer selbst ist der Chip zu RISM Online.
export function SourceRism({ source }: { source: Source }) {
  if (!source.rismUrl) {
    return source.rismLabel ? <>{source.rismLabel}</> : null
  }
  return <ExternalChip label={source.rismLabel ?? 'RISM Online'} href={source.rismUrl} tooltip={rismTooltip(source)} />
}
