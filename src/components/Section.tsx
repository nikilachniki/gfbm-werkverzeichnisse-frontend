import type { ReactNode } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

const headings = {
  2: { variant: 'h5', component: 'h2' },
  3: { variant: 'h6', component: 'h3' },
  4: { variant: 'subtitle1', component: 'h4' },
} as const

// Ein einklappbarer Abschnitt der Detailseiten, standardmaessig geschlossen.
// unmountOnExit, weil manche Werke hunderte Handschriften haben, die sonst
// auch zugeklappt gerendert wuerden.
export function Section({
  title,
  count,
  defaultExpanded = false,
  onExpandedChange,
  level = 3,
  children,
}: {
  title: string
  count?: number
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  // Ueberschriftenebene, fuer ineinander verschachtelte Abschnitte
  level?: keyof typeof headings
  children: ReactNode
}) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      onChange={(_, expanded) => onExpandedChange?.(expanded)}
      disableGutters
      elevation={0}
      square
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ borderTop: level === 2 ? 0 : 1, borderColor: 'divider' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
        <Typography {...headings[level]}>
          {title}
          {count !== undefined && (
            <Typography component="span" color="text.secondary">
              {' '}({count})
            </Typography>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  )
}
