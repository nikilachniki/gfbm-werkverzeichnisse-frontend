import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { SxProps, Theme } from '@mui/material/styles'

// Verweis auf eine fremde Seite als Chip mit Pfeil, Gegenstueck zu SourceChip.
// stopPropagation, damit der Klick nicht auch die Zeile oder das Akkordeon trifft.
export function ExternalChip({
  label,
  href,
  tooltip,
  maxWidth,
  sx,
}: {
  label: string
  href: string
  tooltip?: string
  maxWidth?: number
  sx?: SxProps<Theme>
}) {
  return (
    <Tooltip title={tooltip ?? `${label} – in neuem Tab öffnen`}>
      <Chip
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        clickable
        onClick={(event) => event.stopPropagation()}
        size="small"
        label={label}
        icon={<OpenInNewIcon />}
        sx={[
          { maxWidth, '& .MuiChip-icon': { order: 2, fontSize: 14, ml: -0.25, mr: 0.75 } },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    </Tooltip>
  )
}
