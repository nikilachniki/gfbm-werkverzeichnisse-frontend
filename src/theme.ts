import { createTheme, alpha } from '@mui/material/styles'
import { deDE } from '@mui/x-data-grid/locales'
// noinspection ES6UnusedImports
import type {} from '@mui/x-data-grid/themeAugmentation'

// Farb- und Formsprache angelehnt an die Häuser, mit denen dieses Projekt
// inhaltlich verbunden ist: die LASSO-Handschriftendatenbank der BAdW
// (https://lasso.badw.de) und die Gesellschaft für Bayerische Musikgeschichte
// (https://gfbm-online.de), deren Löwen-Emblem im Header erscheint.
const brandNavy = '#243661'
const brandBlue = '#3F5FAC'
const brandBlueLight = '#7c93cf'

// Eigene Paletteneintraege fuer Farben, die keine MUI-Rolle haben, aber an
// mehreren Stellen gleich aussehen muessen: das Gelb der Suchtreffer (Markierung
// im Text und Balken an der Trefferzeile) und die Normdaten-Badges (GND,
// VIAF, RISM).
declare module '@mui/material/styles' {
  interface Palette {
    highlight: { mark: string; bar: string }
    authority: { gnd: string; viaf: string; rism: string }
  }
  interface PaletteOptions {
    highlight?: { mark: string; bar: string }
    authority?: { gnd: string; viaf: string; rism: string }
  }
}

export const theme = createTheme(
  {
    colorSchemes: {
      light: {
        palette: {
          primary: { main: brandBlue, dark: brandNavy, light: brandBlueLight },
          background: { default: '#F5F6FA' },
          highlight: { mark: 'rgba(255, 213, 0, 0.5)', bar: '#f2c200' },
          authority: { gnd: '#1a5fb4', viaf: '#26a269', rism: '#9b2335' },
        },
      },
      dark: {
        palette: {
          primary: { main: brandBlueLight, dark: brandNavy, light: '#a9bbe0' },
          // Auf dunklem Grund wuerde das halbtransparente Gelb den hellen Text
          // ueberstrahlen, daher schwaecher.
          highlight: { mark: 'rgba(255, 213, 0, 0.35)', bar: '#f2c200' },
          authority: { gnd: '#1a5fb4', viaf: '#26a269', rism: '#9b2335' },
        },
      },
    },
    shape: { borderRadius: 10 },
    // Ueberschriften sind durchweg fett; so steht das an einer Stelle statt
    // als fontWeight an jeder Ueberschrift. Abstaende bleiben an der Stelle.
    typography: {
      // Mit der App ausgeliefert (@fontsource), damit keine Anfrage an Google geht.
      fontFamily: '"Source Sans 3 Variable", "Source Sans 3", "Segoe UI", system-ui, sans-serif',
      // Source Sans laeuft etwas kleiner als Roboto, daher eine Stufe groesser.
      fontSize: 15,
      // Knoepfe und Tabs in normaler Schreibung statt in Versalien.
      button: { textTransform: 'none', fontWeight: 600 },
      h4: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 700 },
    },
    components: {
      // Verweise auf Datensaetze und Kataloge sind Chips (PrintChip,
      // ExternalChip); Links bleiben nur im Fliesstext, dort ohne die
      // dauerhafte Unterstreichung.
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { fontWeight: 500 } },
      },
      MuiAppBar: {
        defaultProps: { position: 'static', elevation: 0 },
        styleOverrides: {
          // Farben aus der Palette statt fest Weiss/Navy, damit der Header im
          // dunklen Modus mitwechselt.
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            backgroundImage: 'none',
            color: theme.palette.mode === 'dark' ? theme.palette.text.primary : brandNavy,
            borderBottom: `3px solid ${brandBlue}`,
          }),
        },
      },
      MuiAccordion: {
        styleOverrides: {
          // Die Akkordeons stehen einzeln umrandet untereinander; die
          // Standard-Trennlinie oberhalb wuerde doppelt wirken.
          root: { '&::before': { display: 'none' } },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: { border: 'none' },
          // Kopfzeile deutlich abgesetzt: kraeftigere Markenfarbe als Grund,
          // fette Beschriftung und eine Linie in Markenblau darunter.
          columnHeaders: ({ theme }) => ({
            backgroundColor: theme.vars
              ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`
              : alpha(theme.palette.primary.main, 0.14),
            borderBottom: `2px solid ${brandBlue}`,
          }),
          columnHeaderTitle: ({ theme }) => ({
            fontWeight: 700,
            color: theme.palette.mode === 'dark' ? theme.palette.text.primary : brandNavy,
          }),
          row: ({ theme }) => ({
            '&:hover': {
              backgroundColor: theme.vars
                ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
                : alpha(theme.palette.primary.main, 0.08),
            },
          }),
          footerContainer: { minHeight: 40 },
        },
      },
    },
  },
  deDE,
)
