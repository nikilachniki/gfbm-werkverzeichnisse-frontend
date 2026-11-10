import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Box from '@mui/material/Box'
import { AuthProvider } from '../auth.tsx'
import { catalogue } from '../catalogueData.ts'
import { EditionsPage } from './EditionsPage.tsx'
import { SiteHeader } from './SiteHeader.tsx'
import { SourceDetailPage } from './SourceDetailPage.tsx'
import { SourcesPage } from './SourcesPage.tsx'
import { WorksPage } from './WorksPage.tsx'
import { WorkDetailPage } from './WorkDetailPage.tsx'
import { defaultSourcesFilters, type SourcesFilters } from '../search/filterSources.ts'
import { defaultWorksFilters, type WorksFilters } from '../search/filterWorks.ts'

// Fruehere Adressen mit Raute, etwa .../#/werk/90, fuehren weiter an dieselbe Stelle.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}${window.location.hash.slice(2)}`)
}

// Die Verwaltung (/admin) wird erst geladen, wenn jemand sie aufruft. So bleibt der Editor
// aus dem Paket fuer Besucher*innen heraus. Schutz ist das nicht: Was gespeichert werden
// darf, entscheidet GitHub (siehe auth.tsx).
const AdminPage = lazy(() => import('./AdminPage.tsx').then((module) => ({ default: module.AdminPage })))

// Die oeffentliche Seite mit Werken, Quellen und Ausgaben.
function PublicSite() {
  const [filters, setFilters] = useState<WorksFilters>(defaultWorksFilters)
  // Wie die Werkfilter hier gehalten, damit die Suche beim Wechsel zur
  // Detailseite und zurueck erhalten bleibt.
  const [sourcesFilters, setSourcesFilters] = useState<SourcesFilters>(defaultSourcesFilters)

  return (
    <>
      <SiteHeader />

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
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
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
                <Suspense fallback={<SiteHeader />}>
                  <AdminPage />
                </Suspense>
              }
            />
            <Route path="*" element={<PublicSite />} />
          </Routes>
        </Box>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
