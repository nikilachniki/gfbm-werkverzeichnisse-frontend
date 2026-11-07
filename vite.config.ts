import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages liefert jede Seite unter einem Unterpfad aus, diese etwa unter
// https://nikilachniki.github.io/lassoDB/, ein Projekt-Repo unter /<repo>/. Ohne den
// passenden base-Pfad wuerden alle relativ verlinkten Assets nach dem Deployment ins
// Leere zeigen. WV_BASE setzt der gemeinsame Build-Workflow (.github/workflows/website.yml).
// Lokal beim Entwickeln bleibt der Pfad die Wurzel.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? (process.env.WV_BASE ?? '/lassoDB/') : '/',
  plugins: [react()],
})
