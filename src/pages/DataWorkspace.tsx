import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { FieldEditor, type EditorContext } from '../baukasten/FieldEditor.tsx'
import {
  assignWorkIds,
  buildCollections,
  createMissingExpressions,
  displayName,
  incompleteRows,
  isManuscript,
  itemsOfSource,
  missingRequired,
  newExpression,
  newRecordId,
  newWork,
  recordFromName,
  recordNumber,
  recordSearchIndex,
  runChecks,
  searchEntries,
  withSourceItem,
  type Check,
  type Draft,
  type ExpressionDraft,
  type PlainEntity,
  type Values,
  type WorkDraft,
} from '../baukasten/generate.ts'
import { ENTITIES, entityOf, isEntityActive, isFieldActive, type Config, type EntityDef, type EntityKey } from '../baukasten/model.ts'

// Liste und Formulare der Datensaetze. Die Einrichtung nutzt sie zum Ausprobieren, die
// Bearbeitung fuer die echten Daten.

type Editing =
  | { entity: 'works'; work: WorkDraft; isNew: boolean }
  // item: das mitbearbeitete Exemplar einer Quelle; ohne @id entsteht es neu
  | { entity: PlainEntity; record: Values; isNew: boolean; item?: Values }

// Lange Listen kommen portionsweise, sonst stockt bei grossen Verzeichnissen das Tippen.
const LIST_PAGE = 200

// Das Formular zu einem vorhandenen Datensatz, null wenn es ihn nicht gibt.
function editingOf(config: Config, draft: Draft, entity: EntityKey, id: string): Editing | null {
  if (entity === 'works') {
    const work = draft.works.find((other) => other.id === id)
    return work ? { entity: 'works', work: structuredClone(work), isNew: false } : null
  }
  const plain = entity as PlainEntity
  const record = draft.records[plain].find((other) => other['@id'] === id)
  return record ? { entity: plain, record: structuredClone(record), isNew: false, ...(plain === 'manifestations' ? { item: itemToEdit(config, draft, id) } : {}) } : null
}

// Der Entwurf samt dem Datensatz, der gerade bearbeitet wird. Daraus entsteht die Live-Vorschau.
function withEditing(draft: Draft, editing: Editing | null): Draft {
  if (!editing) {
    return draft
  }
  if (editing.entity === 'works') {
    const assigned = assignWorkIds(editing.work, draft.works)
    return {
      ...draft,
      works: editing.isNew ? [...draft.works, assigned] : draft.works.map((work) => (work.id === assigned.id ? assigned : work)),
    }
  }
  const list = draft.records[editing.entity]
  const id = recordId(editing.entity, editing.record, list)
  const record = { ...editing.record, '@id': id }
  const next = {
    ...draft,
    records: {
      ...draft.records,
      [editing.entity]: editing.isNew ? [...list, record] : list.map((other) => (other['@id'] === id ? record : other)),
    },
  }
  return hasItemForm(editing) ? withSourceItem(next, id, editing.item!) : next
}

// Nur eine Handschrift bekommt ihr Exemplar im selben Formular.
const hasItemForm = (editing: Editing): boolean => editing.entity === 'manifestations' && Boolean(editing.item) && isManuscript(editing.record)

// Bei mehreren Exemplaren waere unklar, welches gemeint ist; die bleiben bei "Exemplare".
function itemToEdit(config: Config, draft: Draft, sourceId: string): Values | undefined {
  const items = itemsOfSource(draft, sourceId)
  if (!isEntityActive(config, 'items') || items.length > 1) {
    return undefined
  }
  return items.length === 1 ? structuredClone(items[0]) : {}
}

const recordId = (entity: PlainEntity, record: Values, list: Values[]): string =>
  (record['@id'] as string | undefined) || newRecordId(entity, record, list.map((other) => other['@id'] as string))

function FieldStack({ entity, values, config, onChange, context, omit = [] }: { entity: EntityDef; values: Values; config: Config; onChange: (next: Values) => void; context: EditorContext; omit?: string[] }) {
  const fields = entity.fields.filter((field) => isFieldActive(config, entity.key, field) && field.input.kind !== 'auto' && !omit.includes(field.key))
  return (
    <Stack spacing={2}>
      {fields.map((field) => {
        const compound = field.input.kind === 'rows' || field.input.kind === 'titles' || (field.input.kind === 'object' && field.input.parts.length > 1)
        return (
          <Box key={field.key}>
            {compound && (
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                {field.label}
              </Typography>
            )}
            <FieldEditor
              part={field}
              entity={entity.key}
              field={field}
              value={values[field.key]}
              onChange={(next) => onChange({ ...values, [field.key]: next })}
              context={context}
            />
          </Box>
        )
      })}
    </Stack>
  )
}

function ManuscriptItem({ item, count, config, context, onChange }: { item?: Values; count: number; config: Config; context: EditorContext; onChange: (next: Values) => void }) {
  if (!item) {
    return count > 1 ? <Alert severity="info">Diese Handschrift hat {count} Exemplare. Sie werden unter „Exemplare“ bearbeitet.</Alert> : null
  }
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" component="h4" sx={{ mb: 1.5 }}>
        Exemplar
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {item['@id'] ? 'Das Exemplar dieser Handschrift lässt sich hier mitbearbeiten.' : 'Zu dieser Handschrift wird beim Übernehmen automatisch ein Exemplar angelegt.'}
      </Alert>
      <FieldStack entity={entityOf('items')} values={item} config={config} context={context} onChange={onChange} omit={['label', 'exemplifies']} />
    </Paper>
  )
}

function WorkForm({ work, config, onChange, context }: { work: WorkDraft; config: Config; onChange: (next: WorkDraft) => void; context: EditorContext }) {
  const mode = config.expressionMode
  const expressionEntity = entityOf('expressions')
  const updateExpression = (index: number, patch: Partial<ExpressionDraft>) =>
    onChange({ ...work, expressions: work.expressions.map((expression, position) => (position === index ? { ...expression, ...patch } : expression)) })

  return (
    <Stack spacing={3}>
      <FieldStack entity={entityOf('works')} values={work.values} config={config} onChange={(values) => onChange({ ...work, values })} context={context} />

      {work.expressions.map((expression, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" component="h4">
              Fassung {index + 1}
            </Typography>
            {(mode === 'manual' || index > 0) && (
              <IconButton size="small" aria-label={`Fassung ${index + 1} entfernen`} onClick={() => onChange({ ...work, expressions: work.expressions.filter((_, position) => position !== index) })}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Bezeichnung"
              placeholder={index === 0 ? 'Folgt dem Werktitel' : 'Etwa „Fassung für Viola“'}
              helperText={index === 0 ? 'Leer lassen, dann folgt sie dem Werktitel.' : undefined}
              value={expression.label}
              onChange={(event) => updateExpression(index, { label: event.target.value })}
            />
            <FieldStack entity={expressionEntity} values={expression.values} config={config} onChange={(values) => updateExpression(index, { values })} context={context} />
          </Stack>
        </Paper>
      ))}

      {work.expressions.length === 0 && (
        <Alert severity="warning">Dieses Werk hat noch keine Fassung. Keine Quelle kann darauf verweisen.</Alert>
      )}
      <Button startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...work, expressions: [...work.expressions, newExpression()] })}>
        Fassung ergänzen
      </Button>
    </Stack>
  )
}

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
        {title}
      </Typography>
      <Box
        component="pre"
        tabIndex={0}
        sx={{ m: 0, mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, overflow: 'auto', fontSize: 12, lineHeight: 1.5, fontFamily: 'monospace' }}
      >
        {children}
      </Box>
    </Box>
  )
}

// Die Meldungen der Pruefung, auf Wunsch mit den Einzelheiten dahinter.
export function CheckList({ checks, onFix, showDetails = false }: { checks: Check[]; onFix: () => void; showDetails?: boolean }) {
  return (
    <>
      {checks.map((check) => (
        <Alert
          key={check.text}
          severity={check.level === 'error' ? 'error' : 'info'}
          action={
            check.fix ? (
              <Button color="inherit" size="small" onClick={onFix}>
                Anlegen
              </Button>
            ) : undefined
          }
        >
          {check.text}
          {showDetails && check.details && (
            <Box component="ul" tabIndex={0} sx={{ m: 0, mt: 1, pl: 2.5, maxHeight: 240, overflow: 'auto', fontSize: 13 }}>
              {check.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </Box>
          )}
        </Alert>
      ))}
    </>
  )
}

function ResultPanel({ config, draft, editing, onFix }: { config: Config; draft: Draft; editing: Editing | null; onFix: () => void }) {
  const preview = useMemo(() => withEditing(draft, editing), [draft, editing])
  const { collections } = useMemo(() => buildCollections(config, preview), [config, preview])
  // Fuer die Pruefung zaehlt das Gespeicherte und das gerade Bearbeitete.
  const checks = useMemo(() => runChecks(config, preview), [config, preview])
  const errors = checks.filter((check) => check.level === 'error')
  const [tab, setTab] = useState<string>('aktuell')

  const activeFiles = ENTITIES.filter((entity) => isEntityActive(config, entity.key))
  const current = useMemo(() => {
    if (!editing) {
      return []
    }
    if (editing.entity === 'works') {
      const assigned = assignWorkIds(editing.work, draft.works)
      return [
        { title: 'works.json', records: collections.works.filter((record) => record['@id'] === assigned.id) },
        { title: 'expressions.json', records: collections.expressions.filter((record) => assigned.expressions.some((expression) => expression.id === record['@id'])) },
      ]
    }
    const id = recordId(editing.entity, editing.record, draft.records[editing.entity])
    const own = { title: entityOf(editing.entity).file, records: collections[editing.entity].filter((record) => record['@id'] === id) }
    return hasItemForm(editing) ? [own, { title: 'items.json', records: collections.items.filter((record) => record.exemplifies === id) }] : [own]
  }, [editing, draft, collections])

  const selectedEntity = tab === 'aktuell' ? null : (ENTITIES.find((entity) => entity.key === tab) ?? null)

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" component="h3">
          Prüfung
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {errors.length === 0 && <Alert severity="success">Gültig und FRBR-konform. Jede Datei folgt dem Schema der Vorlage.</Alert>}
          <CheckList checks={checks} onFix={onFix} />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" component="h3">
          Was in den Dateien entsteht
        </Typography>
        <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 1.5 }} aria-label="Dateien">
          <Tab value="aktuell" label="Aktuell" sx={{ minWidth: 0 }} />
          {activeFiles.map((entity) => (
            <Tab key={entity.key} value={entity.key} label={`${entity.plural} (${collections[entity.key].length})`} sx={{ minWidth: 0 }} />
          ))}
        </Tabs>
        {selectedEntity ? (
          <CodeBlock title={selectedEntity.file}>{JSON.stringify(collections[selectedEntity.key], null, 2)}</CodeBlock>
        ) : current.length > 0 ? (
          <Stack spacing={1.5}>
            {current.map(({ title, records }) => (
              <CodeBlock key={title} title={title}>
                {JSON.stringify(records.length === 1 ? records[0] : records, null, 2)}
              </CodeBlock>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Lege links einen Datensatz an oder öffne einen. Hier siehst du dann live, welche Einträge daraus entstehen.
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}

// target: der Datensatz, der beim Aufruf gleich geoeffnet wird, etwa vom Bearbeiten-Symbol
// einer Detailseite. Der Typ stammt aus der Adresse und kann darum auch unbekannt sein.
export function DataWorkspace({ config, draft, onDraft, onSample, showFiles, target }: { config: Config; draft: Draft; onDraft: (next: Draft) => void; onSample?: () => void; showFiles: boolean; target?: { entity: EntityKey; id: string } }) {
  const entities = ENTITIES.filter((entity) => entity.key !== 'expressions' && isEntityActive(config, entity.key))
  const targetKnown = target !== undefined && entities.some((entity) => entity.key === target.entity)
  const [selected, setSelected] = useState<EntityKey>(targetKnown ? target.entity : 'works')
  const [openForm, setEditing] = useState<Editing | null>(() => (targetKnown ? editingOf(config, draft, target.entity, target.id) : null))
  // Was gerade nebenbei passiert ist; link fuehrt zu den Exemplaren.
  const [notice, setNotice] = useState<{ text: string; link: boolean; warning?: boolean } | null>(() =>
    target && !openForm ? { text: `Der Datensatz ${target.id} ist im aktuellen Bearbeitungsstand nicht vorhanden.`, link: false, warning: true } : null,
  )
  // Ein Formular gilt nur, solange sein Datentyp eingeschaltet ist.
  const editing = openForm && entities.some((entity) => entity.key === openForm.entity) ? openForm : null
  const current = entities.find((entity) => entity.key === selected) ?? entities[0]

  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(LIST_PAGE)

  const currentKey = current.key
  const abbreviation = config.catalogue.abbreviation.trim()
  const list = useMemo(() => {
    const entry = (id: string, values: Values) => ({ id, label: displayName(currentKey, values) || id, number: recordNumber(currentKey, values, abbreviation), document: recordSearchIndex(currentKey, id, values) })
    return currentKey === 'works' ? draft.works.map((work) => entry(work.id, work.values)) : draft.records[currentKey as PlainEntity].map((record) => entry(record['@id'] as string, record))
  }, [currentKey, draft, abbreviation])
  const found = useMemo(() => searchEntries(list, query), [list, query])
  const shown = found.slice(0, limit)

  const showType = (value: EntityKey) => {
    setSelected(value)
    setEditing(null)
    setNotice(null)
    setQuery('')
    setLimit(LIST_PAGE)
  }

  const startNew = () => {
    setNotice(null)
    if (current.key === 'works') {
      setEditing({ entity: 'works', work: newWork(config), isNew: true })
    } else {
      setEditing({ entity: current.key as PlainEntity, record: {}, isNew: true, ...(current.key === 'manifestations' && isEntityActive(config, 'items') ? { item: {} } : {}) })
    }
  }

  const open = (id: string) => {
    setNotice(null)
    const form = editingOf(config, draft, current.key, id)
    if (form) {
      setEditing(form)
    }
  }

  const missing = !editing
    ? []
    : editing.entity === 'works'
      ? missingRequired(config, entityOf('works'), editing.work.values)
      : missingRequired(config, entityOf(editing.entity), editing.record)

  const incomplete = !editing
    ? []
    : editing.entity === 'works'
      ? [
          ...incompleteRows(config, entityOf('works'), editing.work.values),
          ...editing.work.expressions.flatMap((expression, index) =>
            incompleteRows(config, entityOf('expressions'), expression.values).map((label) => `${label} (Fassung ${index + 1})`),
          ),
        ]
      : [
          ...incompleteRows(config, entityOf(editing.entity), editing.record),
          ...(hasItemForm(editing) ? incompleteRows(config, entityOf('items'), editing.item!).map((label) => `${label} (Exemplar)`) : []),
        ]

  const save = () => {
    onDraft(withEditing(draft, editing))
    if (editing && editing.entity !== 'works' && hasItemForm(editing) && !editing.item!['@id']) {
      const shelfmark = (editing.item!.shelfmark as string | undefined)?.trim()
      setNotice({ text: `Exemplar ${shelfmark ? `„${shelfmark}“ ` : ''}wurde automatisch angelegt.`, link: true })
    }
    setEditing(null)
  }

  const remove = () => {
    if (!editing) {
      return
    }
    if (editing.entity === 'works') {
      onDraft({ ...draft, works: draft.works.filter((work) => work.id !== editing.work.id) })
    } else {
      const entity = editing.entity
      const records = { ...draft.records, [entity]: draft.records[entity].filter((record) => record['@id'] !== editing.record['@id']) }
      // Das Exemplar einer Handschrift geht mit ihr, sonst bliebe ein Verweis ins Leere.
      if (hasItemForm(editing) && editing.item!['@id']) {
        records.items = records.items.filter((item) => item['@id'] !== editing.item!['@id'])
        setNotice({ text: 'Das Exemplar der Handschrift wurde mit gelöscht.', link: false })
      }
      onDraft({ ...draft, records })
    }
    setEditing(null)
  }

  const context: EditorContext = {
    config,
    // Neue Hilfsdatensaetze stehen sofort zur Wahl, auch ohne dass das Formular gespeichert ist.
    draft,
    createRecord: (entity, name) => {
      const list = draft.records[entity]
      const record = recordFromName(entity, name, list.map((other) => other['@id'] as string))
      onDraft({ ...draft, records: { ...draft.records, [entity]: [...list, record] } })
      return record['@id'] as string
    },
  }

  const isEmpty = draft.works.length === 0 && Object.values(draft.records).every((records) => records.length === 0)

  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: showFiles ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }, alignItems: 'flex-start' }}>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Tabs
          value={current.key}
          onChange={(_, value: EntityKey) => showType(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Datentypen"
        >
          {entities.map((entity) => (
            <Tab key={entity.key} value={entity.key} sx={{ minWidth: 0 }} label={entity.plural} />
          ))}
        </Tabs>

        {notice && (
          <Alert severity={notice.warning ? 'warning' : 'success'} onClose={() => setNotice(null)}>
            {notice.text}
            {notice.link && (
              <Button color="inherit" size="small" sx={{ ml: 1 }} onClick={() => showType('items')}>
                Exemplare anzeigen
              </Button>
            )}
          </Alert>
        )}

        {editing ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
              {editing.isNew ? `${current.label} anlegen` : `${current.label} bearbeiten`}
            </Typography>
            {editing.entity === 'works' ? (
              <WorkForm work={editing.work} config={config} context={context} onChange={(work) => setEditing({ ...editing, work })} />
            ) : (
              <Stack spacing={3}>
                <FieldStack entity={current} values={editing.record} config={config} context={context} onChange={(record) => setEditing({ ...editing, record })} />
                {editing.entity === 'manifestations' && isManuscript(editing.record) && (
                  <ManuscriptItem
                    item={editing.item}
                    count={itemsOfSource(draft, editing.record['@id'] as string).length}
                    config={config}
                    context={context}
                    onChange={(item) => setEditing({ ...editing, item })}
                  />
                )}
              </Stack>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 3, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <Button variant="contained" disabled={missing.length > 0 || incomplete.length > 0} onClick={save}>
                Übernehmen
              </Button>
              <Button onClick={() => setEditing(null)}>Abbrechen</Button>
              {!editing.isNew && (
                <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={remove}>
                  Löschen
                </Button>
              )}
              {missing.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Es fehlt noch: {missing.join(', ')}
                </Typography>
              )}
              {incomplete.length > 0 && (
                <Typography variant="caption" color="error">
                  Unvollständige Zeilen ergänzen oder entfernen: {incomplete.join(', ')}
                </Typography>
              )}
            </Stack>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" component="h3">
                {current.plural} ({query.trim() ? `${found.length} von ${list.length}` : list.length})
              </Typography>
              <Stack direction="row" spacing={1}>
                {onSample && isEmpty && (
                  <Button size="small" onClick={onSample}>
                    Beispiel laden
                  </Button>
                )}
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={startNew}>
                  {current.label} anlegen
                </Button>
              </Stack>
            </Stack>
            {list.length > 0 && (
              <TextField
                size="small"
                fullWidth
                type="search"
                label={`${current.plural} suchen`}
                placeholder="Titel, Nummer, Name oder Signatur"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(LIST_PAGE)
                }}
                sx={{ mt: 2 }}
              />
            )}
            {list.length > 0 ? (
              <>
                {shown.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Nichts gefunden.
                  </Typography>
                )}
                <List dense disablePadding sx={{ mt: 1 }}>
                  {shown.map((entry) => (
                    <ListItemButton key={entry.id} onClick={() => open(entry.id)} sx={{ borderRadius: 1 }}>
                      <ListItemText
                        primary={
                          <>
                            {entry.number && (
                              <Box component="span" sx={{ fontWeight: 700, mr: 1 }}>
                                {entry.number}
                              </Box>
                            )}
                            {entry.label}
                          </>
                        }
                        secondary={entry.id}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {found.length > shown.length && (
                  <Button size="small" sx={{ mt: 1 }} onClick={() => setLimit(limit + LIST_PAGE)}>
                    Weitere anzeigen ({found.length - shown.length})
                  </Button>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {current.key === 'works' ? `Noch keine Werke.${showFiles ? ' Lege eines an und beobachte, was rechts passiert.' : ''}` : `Noch nichts angelegt. ${current.blurb}`}
              </Typography>
            )}
          </Paper>
        )}
      </Stack>
      {/* In der Bearbeitung stehen die Meldungen neben dem Speichern, siehe EditorPage. */}
      {showFiles && (
        <Box sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
          <ResultPanel config={config} draft={draft} editing={editing} onFix={() => onDraft(createMissingExpressions(draft))} />
        </Box>
      )}
    </Box>
  )
}
