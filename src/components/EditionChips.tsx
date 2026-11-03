import { useNavigate } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import type { EditionAppearance } from '../types.ts'
import { editionAppearanceVolumeTitle, formatEditionAppearance, volumePath } from '../worksData.ts'

// Die Fundstellen eines Werks oder einer Fassung als Chips, die zum Band in der
// Gesamtausgabe fuehren; dort ist die Zeile des Werks markiert. stopPropagation
// wie bei PrintChip, damit der Klick nicht zugleich die Tabellenzeile ausloest.
export function EditionChips({ item }: { item: { '@id': string; editionAppearances: EditionAppearance[] } }) {
  const navigate = useNavigate()
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
      {item.editionAppearances.map((appearance) => (
        <Tooltip key={appearance.inVolume} title={editionAppearanceVolumeTitle(appearance)}>
          <Chip
            size="small"
            variant="outlined"
            clickable
            label={formatEditionAppearance(appearance)}
            onClick={(event) => {
              event.stopPropagation()
              navigate(volumePath(appearance.inVolume), { state: { focus: item['@id'] } })
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  )
}
