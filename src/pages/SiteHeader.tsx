import { useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { useAuth } from '../authContext.ts'
import { catalogue, editions, sources } from '../catalogueData.ts'
import { InfoDialog } from './InfoDialog.tsx'
import { LoginDialog } from './LoginForm.tsx'

const isAdminPath = (pathname: string) => pathname.startsWith('/admin')

// Hauptbereiche Werke, Quellen und Ausgaben, nach dem Anmelden auch die Verwaltung.
// Die Detailseiten zaehlen zu ihrem Bereich.
function MainNav() {
  const { pathname } = useLocation()
  const { status } = useAuth()
  const signedIn = status === 'signedIn'
  const section = isAdminPath(pathname)
    ? 'verwaltung'
    : pathname.startsWith('/quelle')
      ? 'quellen'
      : pathname.startsWith('/ausgaben')
        ? 'ausgaben'
        : 'werke'
  return (
    <Tabs
      // Unter /admin gibt es vor dem Anmelden noch keinen passenden Reiter.
      value={section === 'verwaltung' && !signedIn ? false : section}
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
      {signedIn && (
        <Tab
          label="Verwaltung"
          value="verwaltung"
          component={RouterLink}
          to="/admin"
          icon={<SettingsOutlinedIcon fontSize="small" />}
          iconPosition="start"
          sx={{ ml: 4 }}
        />
      )}
    </Tabs>
  )
}

// Die Kopfzeile von Website und Verwaltung. Die Verwaltung zeigt den Namen aus dem Repo,
// der vom gebauten Stand abweichen kann.
export function SiteHeader({ title = catalogue.label }: { title?: string }) {
  const { status, login, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [infoOpen, setInfoOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  const leave = () => {
    signOut()
    if (isAdminPath(pathname)) {
      navigate('/')
    }
  }

  return (
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
          title={title}
          sx={{ lineHeight: 1.2, flex: '0 1 auto', minWidth: 0, display: { xs: 'none', sm: 'block' } }}
        >
          {title}
        </Typography>
        {/* Ist der Titel sichtbar, kuerzt er zuerst; die Navigation bleibt ganz. Auf dem
            Handy ist er ausgeblendet, dann wird die Navigation wischbar. */}
        <Box sx={{ flexGrow: 1, flexShrink: { xs: 1, sm: 0 }, flexBasis: 'auto', minWidth: { xs: 0, sm: 'auto' } }}>
          <MainNav />
        </Box>
        {/* Rechts ohne Zwischenraum, die beiden Symbole gehoeren zusammen. */}
        <Box sx={{ display: 'flex', flexShrink: 0 }}>
          <Tooltip title="Informationen zum Projekt">
            <IconButton color="inherit" aria-label="Informationen zum Projekt" onClick={() => setInfoOpen(true)}>
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
          {status === 'signedOut' && (
            <Tooltip title="Anmeldung für die Redaktion">
              <IconButton color="inherit" aria-label="Anmeldung für die Redaktion" onClick={() => setLoginOpen(true)}>
                <LoginIcon />
              </IconButton>
            </Tooltip>
          )}
          {status === 'signedIn' && (
            <Tooltip title={`Abmelden (${login})`}>
              <IconButton color="inherit" aria-label={`Abmelden (${login})`} onClick={leave}>
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
        <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
      </Toolbar>
    </AppBar>
  )
}
