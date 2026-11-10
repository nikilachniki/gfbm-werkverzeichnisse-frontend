import { Link as RouterLink } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { useAuth } from '../authContext.ts'
import type { EntityKey } from '../baukasten/model.ts'

// Fuehrt von der Website direkt zum Formular dieses Datensatzes in der Verwaltung.
// Nur nach dem Anmelden sichtbar.
export function EditRecordButton({ entity, id, label }: { entity: EntityKey; id: string; label: string }) {
  const { status } = useAuth()
  if (status !== 'signedIn') {
    return null
  }
  const title = `${label} bearbeiten`
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} component={RouterLink} to={`/admin?${new URLSearchParams({ typ: entity, id })}`}>
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}
