import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages liefert jede Seite unter einem Unterpfad aus, diese etwa unter
// https://nikilachniki.github.io/gfbm-werkverzeichnisse-frontend/, ein Projekt-Repo unter /<repo>/. Ohne den
// passenden base-Pfad wuerden alle relativ verlinkten Assets nach dem Deployment ins
// Leere zeigen. WV_BASE setzen beide Workflows aus dem Repo-Namen (deploy.yml, website.yml).
// Lokal beim Entwickeln bleibt der Pfad die Wurzel.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? (process.env.WV_BASE ?? '/gfbm-werkverzeichnisse-frontend/') : '/',
  plugins: [react()],
})
