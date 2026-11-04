# Werkverzeichnis-Oberfläche

Prototyp einer Weboberfläche für musikalische Werkverzeichnisse, entstanden aus der
Lasso-Werkdatenbank (Branch `main`). Sie zeigt die Daten der
[Werkverzeichnis-Vorlage](https://github.com/nikilachniki/lassoDBData/tree/werkverzeichnis-vorlage):
Werke, Quellen (Drucke und Handschriften) und Ausgaben. Name, Kürzel und alle Inhalte
kommen aus den Daten; ein neues Verzeichnis braucht keine Änderung am Code.

Technisch: Vite, React, TypeScript, MUI mit der DataGrid-Komponente. Reine statische
Auslieferung ohne Server oder Datenbank. **Noch ohne Eingabe:** Daten werden in der
Vorlage gepflegt, die Oberfläche zeigt sie nur an.

## Wie die Daten hierherkommen

`scripts/sync-data.mjs` kopiert bei jedem Start die JSON-LD-Dateien eines
Verzeichnisses nach `src/data/`, von wo sie ins Bundle eingebunden werden. Der Ordner
ist in `.gitignore` eingetragen. `src/catalogueData.ts` führt sie beim Laden in die
Anzeigemodelle über und ergänzt die Gegenrichtung der Beziehungen.

Ohne weitere Angabe wird der Auszug `examples/lasso-schwierig` aus lassoDBData
verwendet, das dafür als Geschwisterordner auf dem Branch `werkverzeichnis-vorlage`
liegen muss:

```
IdeaProjects/
├── lassoDB/
└── lassoDBData/
```

Ein anderes Verzeichnis wählt `WV_DATA_DIR`, in PowerShell etwa:

```powershell
$env:WV_DATA_DIR = "..\lassoDBData\examples\beispiel"; npm run dev
```

## Entwicklung

Voraussetzung ist Node.js, empfohlen die aktuelle LTS-Version.

```bash
npm install
npm run dev
```

`npm run dev` und `npm run build` synchronisieren die Daten automatisch vorab.

## Deployment

Der Workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) baut bei
jedem Push nach `main` und veröffentlicht auf GitHub Pages. Solange die Vorlage nur ein
Branch ist, läuft er von hier aus nicht. Vor einem Merge nach `main` ist zu entscheiden,
welches Verzeichnis dort erscheinen soll, denn der Workflow ist auf den Auszug
`examples/lasso-schwierig` eingestellt.

Der Pfad `/lassoDB/` steht in `vite.config.ts` und passt nur zu diesem Repository.
