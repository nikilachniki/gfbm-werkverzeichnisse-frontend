import { useNavigate } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import type { SxProps, Theme } from '@mui/material/styles'
import { findSourceBySiglum, sourceLabel, sourcePath } from '../catalogueData.ts'

// Sigle einer Quelle als Chip, der zu ihrer Detailseite fuehrt. stopPropagation
// verhindert, dass der Klick zugleich die umgebende Zeile bzw. das Akkordeon ausloest.
export function SourceChip({ siglum, maxWidth, sx }: { siglum: string; maxWidth?: number; sx?: SxProps<Theme> }) {
  const navigate = useNavigate()
  const source = findSourceBySiglum(siglum)
  const tooltip = [source ? sourceLabel(source) : siglum, source?.dateLabel ?? '', source?.description ?? '']
    .filter(Boolean)
    .join(' – ')
  return (
    <Tooltip title={tooltip}>
      <Chip
        size="small"
        label={siglum}
        variant="outlined"
        clickable={Boolean(source)}
        onClick={
          source
            ? (event) => {
                event.stopPropagation()
                navigate(sourcePath(source))
              }
            : undefined
        }
        sx={[{ maxWidth }, ...(Array.isArray(sx) ? sx : [sx])]}
      />
    </Tooltip>
  )
}
