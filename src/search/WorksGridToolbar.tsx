import { useState } from 'react'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {
  ColumnsPanelTrigger,
  ExportCsv,
  ExportPrint,
  FilterPanelTrigger,
  Toolbar,
  useGridRootProps,
} from '@mui/x-data-grid'
import type { Work } from '../types'

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    works: Work[]
  }
}

// Der JSON-Export liefert die ungekürzten Werke statt der Tabellenzeilen.
function downloadWorksAsJson(works: Work[]) {
  const blob = new Blob([JSON.stringify(works, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'werke.json'
  link.click()
  URL.revokeObjectURL(url)
}

export interface WorksGridToolbarProps {
  works: Work[]
}

// Beschriftete Textbuttons statt der reinen Icon-Buttons der Standard-Toolbar.
// Texte und Icons kommen aus Grid-Locale (deDE) und Grid-Slots, damit sie zum
// Rest der Tabelle passen.
export function WorksGridToolbar({ works }: WorksGridToolbarProps) {
  const rootProps = useGridRootProps()
  const t = rootProps.localeText
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null)
  const closeExportMenu = () => setExportMenuAnchor(null)

  return (
    <Toolbar style={{ justifyContent: 'flex-start' }}>
      <ColumnsPanelTrigger
        render={<Button size="small" startIcon={<rootProps.slots.columnSelectorIcon />} />}
      >
        {t.toolbarColumns}
      </ColumnsPanelTrigger>
      <FilterPanelTrigger
        render={(props, state) => (
          <Button
            {...props}
            size="small"
            startIcon={
              <Badge badgeContent={state.filterCount} color="primary">
                <rootProps.slots.openFilterButtonIcon />
              </Badge>
            }
          />
        )}
      >
        {t.toolbarFilters}
      </FilterPanelTrigger>
      <Button
        size="small"
        startIcon={<rootProps.slots.exportIcon />}
        aria-haspopup="menu"
        aria-expanded={exportMenuAnchor !== null}
        onClick={(event) => setExportMenuAnchor(event.currentTarget)}
      >
        {t.toolbarExport}
      </Button>
      <Menu anchorEl={exportMenuAnchor} open={exportMenuAnchor !== null} onClose={closeExportMenu}>
        <ExportCsv render={<MenuItem />} onClick={closeExportMenu}>
          {t.toolbarExportCSV}
        </ExportCsv>
        <ExportPrint render={<MenuItem />} onClick={closeExportMenu}>
          {t.toolbarExportPrint}
        </ExportPrint>
        <MenuItem
          onClick={() => {
            downloadWorksAsJson(works)
            closeExportMenu()
          }}
        >
          JSON exportieren
        </MenuItem>
      </Menu>
    </Toolbar>
  )
}
