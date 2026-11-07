import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import { catalogue, editions, sources } from '../catalogueData.ts'
import { EditionsPage } from './EditionsPage.tsx'
import { InfoDialog } from './InfoDialog.tsx'
import { SourceDetailPage } from './SourceDetailPage.tsx'
import { SourcesPage } from './SourcesPage.tsx'
import { WorksPage } from './WorksPage.tsx'
import { WorkDetailPage } from './WorkDetailPage.tsx'
import { defaultSourcesFilters, type SourcesFilters } from '../search/filterSources.ts'
import { defaultWorksFilters, type WorksFilters } from '../search/filterWorks.ts'

// Die Verwaltung (#/admin) ist von der Seite aus nicht verlinkt und wird erst geladen,
// wenn jemand sie aufruft. So bleibt der Editor aus dem Paket fuer Besucher*innen heraus.
// Schutz ist das nicht: Was gespeichert werden darf, entscheidet GitHub (siehe auth.tsx).
const AdminPage = lazy(() => import('./AdminPage.tsx').then((module) => ({ default: module.AdminPage })))

// Hauptbereiche Werke, Quellen und Ausgaben. Die Detailseiten zaehlen zu ihrem Bereich.
function MainNav() {
  const { pathname } = useLocation()
  const section = pathname.startsWith('/quelle')
    ? 'quellen'
    : pathname.startsWith('/ausgaben')
      ? 'ausgaben'
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
      {/* Bereiche ohne Eintraege, etwa Quellen bei einem Verzeichnis, das keine erfasst, entfallen. */}
      {sources.length > 0 && <Tab label="Quellen" value="quellen" component={RouterLink} to="/quellen" />}
      {editions.length > 0 && <Tab label="Ausgaben" value="ausgaben" component={RouterLink} to="/ausgaben" />}
    </Tabs>
  )
}

// Die oeffentliche Seite mit Werken, Quellen und Ausgaben.
function PublicSite() {
  const [infoOpen, setInfoOpen] = useState(false)
  const [filters, setFilters] = useState<WorksFilters>(defaultWorksFilters)
  // Wie die Werkfilter hier gehalten, damit die Suche beim Wechsel zur
  // Detailseite und zurueck erhalten bleibt.
  const [sourcesFilters, setSourcesFilters] = useState<SourcesFilters>(defaultSourcesFilters)

  return (
    <>
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
          {/* So breit wie der Name des Verzeichnisses; gekuerzt wird erst, wenn der Platz fehlt. */}
          <Typography
            variant="h6"
            component="h1"
            noWrap
            title={catalogue.label}
            sx={{ lineHeight: 1.2, flex: '0 1 auto', minWidth: 0, display: { xs: 'none', sm: 'block' } }}
          >
            {catalogue.label}
          </Typography>
          {/* Ist der Titel sichtbar, kuerzt er zuerst; die Navigation bleibt ganz. Auf dem
              Handy ist er ausgeblendet, dann wird die Navigation wischbar. */}
          <Box sx={{ flexGrow: 1, flexShrink: { xs: 1, sm: 0 }, flexBasis: 'auto', minWidth: { xs: 0, sm: 'auto' } }}>
            <MainNav />
          </Box>
          <Tooltip title="Informationen zum Projekt">
            <IconButton color="inherit" aria-label="Informationen zum Projekt" onClick={() => setInfoOpen(true)}>
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
          <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
        </Toolbar>
      </AppBar>

      <Routes>
        <Route path="/" element={<WorksPage filters={filters} onFiltersChange={setFilters} />} />
        <Route path="/werk/:slug" element={<WorkDetailPage />} />
        <Route path="/quellen" element={<SourcesPage filters={sourcesFilters} onFiltersChange={setSourcesFilters} />} />
        <Route path="/quelle/:slug" element={<SourceDetailPage />} />
        <Route path="/ausgaben" element={<EditionsPage />} />
        <Route path="/ausgaben/:volume" element={<EditionsPage />} />
        {/* Frueherer Ort des Baukastens */}
        <Route path="/baukasten" element={<Navigate to="/admin" replace />} />
      </Routes>
    </>
  )
}

function App() {
  useEffect(() => {
    document.title = catalogue.label
  }, [])

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
        <Routes>
          <Route
            path="/admin"
            element={
              <Suspense fallback={null}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<PublicSite />} />
        </Routes>
      </Box>
    </HashRouter>
  )
}

export default App
