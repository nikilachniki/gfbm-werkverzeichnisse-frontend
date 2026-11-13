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

`scripts/sync-data.mjs` holt bei jedem Start die JSON-LD-Dateien eines
Verzeichnisses nach `src/data/`, von wo sie ins Bundle eingebunden werden. Der Ordner
ist in `.gitignore` eingetragen. `src/catalogueData.ts` führt sie beim Laden in die
Anzeigemodelle über und ergänzt die Gegenrichtung der Beziehungen.

`npm run dev` lädt sie aus dem Repo in `.env.development` von GitHub, also aus demselben,
mit dem auch die Verwaltung arbeitet. Das braucht eine Internetverbindung und ein
öffentliches Repo. Angezeigt wird der Stand von `VITE_DATA_BRANCH` beim Start, Änderungen
aus der Verwaltung erscheinen nach dem Veröffentlichen und einem Neustart.

Ohne weitere Angabe, etwa bei `npm run build`, wird der Beispieldatensatz `examples/`
aus der Vorlage verwendet, die dafür als Geschwisterordner auf dem Branch `main` liegen muss (der
frühere Ordnername `lassoDBData` geht auch):

```
IdeaProjects/
├── gfbm-werkverzeichnisse-frontend/   (oder lassoDB)
└── gfbm-werkverzeichnisse/
```

Ein anderes Verzeichnis wählt `WV_DATA_DIR`, das immer Vorrang hat, in PowerShell etwa:

```powershell
$env:WV_DATA_DIR = "..\gfbm-werkverzeichnisse\examples\beispiel"; npm run dev
```

## Baukasten

Der Baukasten liegt in der Verwaltung unter `/admin`. Die Redaktion meldet sich über das
Symbol oben rechts mit einem GitHub-Token an; danach erscheint in der Kopfzeile der Reiter
**Verwaltung**. Geladen wird der Editor erst, wenn man ihn öffnet. Was dort erscheint,
entscheidet die `baukasten.json` auf `main` im Datenordner:

- **Ohne sie läuft die Einrichtung:** Vorlage wählen (Lasso, Le Beau oder leer), Datentypen
  und Felder an- und abwählen, festlegen, wie Werk und Expression verknüpft sind, und das
  Formular ausprobieren. Einträge vom Ausprobieren bleiben im Browser. **Abschließen**
  schreibt die Auswahl als `baukasten.json` samt Name, Kürzel und Komponist*in direkt nach
  `main`.
- **Mit ihr öffnet sich die Bearbeitung** der echten Daten aus dem Repo. Jeder Datensatz
  behält dabei sein Original; ein Feld ändert sich nur, wenn es im Formular geändert wurde.
  Unbekannte und abgewählte Felder, die Reihenfolge und die Schreibweise bleiben erhalten.
  Im Bereich **Einrichtung** lassen sich Name, Kürzel, Bausteine und Felder nachträglich
  ändern. Einschalten geht immer, abschalten nur, solange keine Daten betroffen sind.

Der Code liegt in `src/baukasten/`. Entwürfe und Anmeldung liegen im Browser je Projekt
getrennt, weil alle Projekte eines Kontos dieselbe Adresse `<owner>.github.io` teilen.

### Speichern ins Daten-Repo

In der Bearbeitung geht es so ins Daten-Repo (`src/baukasten/github.ts`):

1. **Nach GitHub speichern** ist ein Commit in den eigenen Zweig `redaktion/<login>`, nie
   auf `main`. Beim nächsten Öffnen geht es dort weiter.
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
`nikilachniki/gfbm-werkverzeichnisse`, `examples`, `main`).

Einmalig einzurichten:
- In der Vorlage das Secret `FRONTEND_DEPLOY_TOKEN`: ein fein granularer Token für
  dieses Repo mit Actions (lesen und schreiben). Ohne ihn baut die Seite nach einer
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
jedem Push nach `main` und veröffentlicht auf GitHub Pages unter
https://nikilachniki.github.io/gfbm-werkverzeichnisse-frontend/. Er zeigt den Beispieldatensatz
`examples/` aus der Vorlage. Den Pfad leitet er aus dem Repo-Namen ab
(`WV_BASE` in `vite.config.ts`).

Projekt-Repos bauen ihre eigene Seite mit
[.github/workflows/website.yml](.github/workflows/website.yml), siehe README der Vorlage.
