import { useNavigate } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import type { Citation } from '../types.ts'
import { citationVolumeTitle, formatCitation, volumePath } from '../catalogueData.ts'

// Die Fundstellen eines Werks oder einer Fassung als Chips, die zum Band fuehren;
// dort ist die Zeile des Werks markiert. stopPropagation, damit der Klick nicht
// zugleich die Tabellenzeile ausloest.
export function CitationChips({ item }: { item: { '@id': string; citations: Citation[] } }) {
  const navigate = useNavigate()
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
      {item.citations.map((citation) => (
        <Tooltip key={formatCitation(citation)} title={citationVolumeTitle(citation)}>
          <Chip
            size="small"
            variant="outlined"
            clickable
            label={formatCitation(citation)}
            onClick={(event) => {
              event.stopPropagation()
              navigate(volumePath(citation.inBibliography), { state: { focus: item['@id'] } })
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  )
}
