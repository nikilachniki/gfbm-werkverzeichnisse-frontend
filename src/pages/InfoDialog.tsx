import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { ExternalLink } from '../components/ExternalLink.tsx'
import { catalogue, getPerson, works } from '../catalogueData.ts'

interface InfoDialogProps {
  open: boolean
  onClose: () => void
}

export function InfoDialog({ open, onClose }: InfoDialogProps) {
  const composer = catalogue.composer ? getPerson(catalogue.composer)?.preferredName : undefined
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        Über dieses Projekt
        <IconButton aria-label="Schließen" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
              {catalogue.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {composer ? `Werke von ${composer}. ` : ''}
              {works.length} Werke, zitiert nach {catalogue.catalogueAbbreviation}.
            </Typography>
            {catalogue.description && (
              <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-line' }}>
                {catalogue.description}
              </Typography>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
              Das Digital Lab
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Diese Anwendung entsteht im Digital Lab der Gesellschaft für Bayerische Musikgeschichte e. V. als
              gemeinsame digitale Infrastruktur für Werkverzeichnisse.
            </Typography>
            <ExternalLink href="https://gfbm-online.de/laufende-editionsprojekte/digitallab/">
              Mehr zum Digital Lab
            </ExternalLink>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
