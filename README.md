# Werkverzeichnis-Oberfläche

Prototyp einer Weboberfläche für musikalische Werkverzeichnisse, entstanden aus der
Lasso-Werkdatenbank (Branch `lasso`). Sie zeigt die Daten der
[Werkverzeichnis-Vorlage](https://github.com/nikilachniki/gfbm-werkverzeichnisse):
Werke, Quellen (Drucke und Handschriften) und Ausgaben. Name, Kürzel und alle Inhalte
kommen aus den Daten; ein neues Verzeichnis braucht keine Änderung am Code.

Technisch: Vite, React, TypeScript, MUI mit der DataGrid-Komponente. Reine statische
Auslieferung ohne Server oder Datenbank. Eingegeben wird in der Verwaltung (siehe
Baukasten), gespeichert direkt im Daten-Repo.

Dieser Code dient allen Werkverzeichnissen: Jedes Projekt-Repo aus der Vorlage baut damit
über `.github/workflows/website.yml` seine eigene Seite. Leere Spalten und Bereiche ohne
Einträge (etwa Quellen) blendet die Seite von selbst aus.

## Wie die Daten hierherkommen

`scripts/sync-data.mjs` kopiert bei jedem Start die JSON-LD-Dateien eines
Verzeichnisses nach `src/data/`, von wo sie ins Bundle eingebunden werden. Der Ordner
ist in `.gitignore` eingetragen. `src/catalogueData.ts` führt sie beim Laden in die
Anzeigemodelle über und ergänzt die Gegenrichtung der Beziehungen.

Ohne weitere Angabe wird der Auszug `examples/lasso-schwierig` aus der Vorlage
verwendet, die dafür als Geschwisterordner auf dem Branch `main` liegen muss (der
frühere Ordnername `lassoDBData` geht auch):

```
IdeaProjects/
├── lassoDB/
└── gfbm-werkverzeichnisse/
```

Ein anderes Verzeichnis wählt `WV_DATA_DIR`, in PowerShell etwa:

```powershell
$env:WV_DATA_DIR = "..\gfbm-werkverzeichnisse\examples\beispiel"; npm run dev
```

## Baukasten

Der Baukasten liegt in der Verwaltung unter `#/admin`. Die Seite verlinkt sie nicht, die
Redaktion ruft die Adresse direkt auf; geladen wird der Editor erst dann. Erreichbar ist
sie nach dem Anmelden mit einem GitHub-Token. Dort stellt man ein
neues Verzeichnis zusammen: Vorlage wählen (Lasso,
Le Beau oder leer), Datentypen und Felder an- und abwählen, festlegen, wie Werk und
Expression verknüpft sind, und das Formular ausprobieren. Heraus kommt ein ZIP mit einem
`data/`-Ordner für die Vorlage und der Auswahl als `baukasten.json`. Der Code liegt in
`src/baukasten/`.

Unter „Ausprobieren“ lässt sich auch ein vorhandenes Verzeichnis öffnen, die Daten
dieser Seite oder ein `data/`-Ordner. Jeder Datensatz behält dabei sein Original; ein Feld
ändert sich nur, wenn es im Formular geändert wurde. Unbekannte und abgewählte Felder,
die Reihenfolge und die Schreibweise bleiben erhalten.

### Speichern ins Daten-Repo

Nach dem Anmelden lässt sich unter „Ausprobieren“ das Verzeichnis aus
dem Daten-Repo öffnen und dorthin speichern (`src/baukasten/github.ts`):

1. **Speichern** ist ein Commit in den eigenen Zweig `redaktion/<login>`, nie auf `main`.
   Beim nächsten Öffnen geht es dort weiter.
2. **Veröffentlichen** öffnet einen Pull Request nach `main`. Der Workflow
   `.github/workflows/pruefen.yml` im Daten-Repo prüft ihn mit `validate.py` und dem
   MeLODy-Export.
3. **Zusammenführen** geht nach grüner Prüfung direkt aus dem Editor, als ein Commit.
   Der Arbeitszweig wird danach gelöscht; nach dem Push auf `main` stößt das Daten-Repo
   den Neubau dieser Seite an.

Der Token ist ein fein granularer Token nur für das Daten-Repo mit Contents und Pull
requests (lesen und schreiben) sowie Actions (lesen). Er bleibt nur in der Sitzung im
Browser. Welches Repo und welcher Ordner bearbeitet werden, legen beim Bauen
`VITE_DATA_REPO`, `VITE_DATA_PATH` und `VITE_DATA_BRANCH` fest (Vorgabe:
`nikilachniki/gfbm-werkverzeichnisse`, `examples/lasso-schwierig`, `main`).

Einmalig einzurichten:
- Im Daten-Repo das Secret `LASSODB_DEPLOY_TOKEN`: ein fein granularer Token für
  lassoDB mit Actions (lesen und schreiben). Ohne ihn baut die Seite nach einer
  Datenänderung nicht von selbst neu.
- Empfohlen: `main` im Daten-Repo schützen (Pull Request nötig, Prüfung „pruefen“ muss
  grün sein). Dann kann niemand an der Prüfung vorbei veröffentlichen.

`npm run check:baukasten` prüft, ob die Bausteine noch zu Schema und Kontext in
der Vorlage passen, und lässt erzeugte Verzeichnisse durch `validate.py` und den
MeLODy-Export laufen. Außerdem öffnet es `data/` und alle Beispiele aus der Vorlage und
prüft, dass sie unverändert gespeichert Byte für Byte gleich bleiben. `scripts/check-github.ts`
spielt Öffnen, Speichern, Konflikt, Veröffentlichen und Zusammenführen gegen ein
nachgebautes GitHub durch. Dafür braucht es Python mit den Paketen aus
`scripts/requirements.txt` der Vorlage.

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
