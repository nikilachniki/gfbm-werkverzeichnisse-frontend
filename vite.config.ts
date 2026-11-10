import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// GitHub Pages kennt nur echte Dateien und beantwortet alles andere, etwa /werk/90, mit der
// 404.html. Die muss deshalb die App selbst sein, den Pfad wertet dann der Router aus.
function pagesFallback(): Plugin {
  let outDir = ''
  return {
    name: 'pages-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

// GitHub Pages liefert jede Seite unter einem Unterpfad aus, diese etwa unter
// https://nikilachniki.github.io/gfbm-werkverzeichnisse-frontend/, ein Projekt-Repo unter /<repo>/. Ohne den
// passenden base-Pfad wuerden alle relativ verlinkten Assets nach dem Deployment ins
// Leere zeigen. WV_BASE setzen beide Workflows aus dem Repo-Namen (deploy.yml, website.yml).
// Lokal beim Entwickeln bleibt der Pfad die Wurzel.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? (process.env.WV_BASE ?? '/gfbm-werkverzeichnisse-frontend/') : '/',
  plugins: [react(), pagesFallback()],
})
