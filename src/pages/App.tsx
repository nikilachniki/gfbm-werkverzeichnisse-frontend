import { useState } from 'react'
import { HashRouter, Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { EditionsPage } from './EditionsPage.tsx'
import { InfoDialog } from './InfoDialog.tsx'
import { PrintDetailPage } from './PrintDetailPage.tsx'
import { PrintsPage } from './PrintsPage.tsx'
import { WorksPage } from './WorksPage.tsx'
import { WorkDetailPage } from './WorkDetailPage.tsx'
import { defaultPrintsFilters, type PrintsFilters } from '../search/filterPrints.ts'
import { defaultWorksFilters, type WorksFilters } from '../search/filterWorks.ts'

// Hauptbereiche Werke, Drucke und Gesamtausgabe. Die Detailseiten zaehlen zu
// ihrem Bereich.
function MainNav() {
  const { pathname } = useLocation()
  const section = pathname.startsWith('/druck')
    ? 'drucke'
    : pathname.startsWith('/gesamtausgabe')
      ? 'gesamtausgabe'
      : 'werke'
  return (
    <Tabs
      value={section}
      textColor="inherit"
      // Auf schmalen Bildschirmen wischbar, damit das Info-Symbol sichtbar bleibt
      variant="scrollable"
      scrollButtons={false}
      sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, minWidth: 0, px: 1.5 } }}
    >
      <Tab label="Werke" value="werke" component={RouterLink} to="/" />
      <Tab label="Drucke" value="drucke" component={RouterLink} to="/drucke" />
      <Tab label="Gesamtausgabe" value="gesamtausgabe" component={RouterLink} to="/gesamtausgabe" />
    </Tabs>
  )
}

function App() {
  const [infoOpen, setInfoOpen] = useState(false)
  const [filters, setFilters] = useState<WorksFilters>(defaultWorksFilters)
  // Wie die Werkfilter hier gehalten, damit die Suche beim Wechsel zur
  // Detailseite und zurueck erhalten bleibt.
  const [printsFilters, setPrintsFilters] = useState<PrintsFilters>(defaultPrintsFilters)

  return (
    <HashRouter>
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        <AppBar sx={{ flexShrink: 0 }}>
          <Toolbar sx={{ gap: 2, py: 1 }}>
            <Link
              href="https://gfbm-online.de"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'inline-flex', flexShrink: 0 }}
            >
              <Box
                component="img"
                src={`${import.meta.env.BASE_URL}gfbm-lion.png`}
                alt="Logo der Gesellschaft für Bayerische Musikgeschichte e. V."
                sx={{ height: { xs: 40, sm: 48 }, width: 'auto' }}
              />
            </Link>
            <Divider orientation="vertical" flexItem sx={{ borderColor: 'currentColor', opacity: 0.2 }} />
            <Typography
              variant="h6"
              component="h1"
              sx={{ lineHeight: 1.2, display: { xs: 'none', sm: 'block' } }}
            >
              Orlando di Lasso
            </Typography>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <MainNav />
            </Box>
            <Tooltip title="Informationen zum Projekt">
              <IconButton
                color="inherit"
                aria-label="Informationen zum Projekt"
                onClick={() => setInfoOpen(true)}
              >
                <InfoOutlinedIcon />
              </IconButton>
            </Tooltip>
            <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
          </Toolbar>
        </AppBar>

        <Routes>
          <Route path="/" element={<WorksPage filters={filters} onFiltersChange={setFilters} />} />
          <Route path="/werk/:slug" element={<WorkDetailPage />} />
          <Route path="/drucke" element={<PrintsPage filters={printsFilters} onFiltersChange={setPrintsFilters} />} />
          <Route path="/druck/:siglum" element={<PrintDetailPage />} />
          <Route path="/gesamtausgabe" element={<EditionsPage />} />
          <Route path="/gesamtausgabe/:volume" element={<EditionsPage />} />
        </Routes>
      </Box>
    </HashRouter>
  )
}

export default App
