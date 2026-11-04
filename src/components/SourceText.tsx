import { Fragment } from 'react'
import Box from '@mui/material/Box'
import { findSourceBySiglum } from '../catalogueData.ts'
import { SourceChip } from './SourceChip.tsx'

// Anzeige von Quellenangaben, siehe Source.

const SIGLUM_PATTERN = /(\d{4}-\d+(?:\/[IVX]+)?)/g

// Text mit Sigeln, etwa "Nachdruck von 1557-2 (über 1559-1)": jedes
// bekannte Sigel wird zum Chip, der zu seinem Druck fuehrt.
export function TextWithSourceLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(SIGLUM_PATTERN).map((part, index) =>
        index % 2 === 1 && findSourceBySiglum(part) ? (
          <SourceChip key={index} siglum={part} sx={{ verticalAlign: 'middle', mx: 0.25 }} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

// Zusaetze des Verzeichnisses in ⟨⟩ (etwa "⟨Wappen⟩") gehoeren nicht zum
// Wortlaut des Drucks und werden deshalb abgesetzt.
function WithEditorialNotes({ text }: { text: string }) {
  return (
    <>
      {text.split(/(⟨[^⟩]*⟩)/).map((part, index) =>
        index % 2 === 1 ? (
          <Box key={index} component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            {part}
          </Box>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

// Das Titelblatt mit seinen Zeilenwechseln ("|") als eigene Zeilen
export function SourceTitle({ title }: { title: string }) {
  return (
    <Box component="span" sx={{ display: 'block', fontFamily: 'Georgia, "Times New Roman", serif' }}>
      {title.split(/\s*\|\s*/).map((line, index) => (
        <Box key={index} component="span" sx={{ display: 'block' }}>
          <WithEditorialNotes text={line} />
        </Box>
      ))}
    </Box>
  )
}

// Verweise als Liste, je Verzeichnis eine Zeile
export function SourceReferences({ references }: { references: { catalogue: string; value: string }[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {references.map((reference) => (
        <Box component="li" key={`${reference.catalogue}|${reference.value}`} sx={{ typography: 'body2' }}>
          {reference.catalogue !== 'sonstige' ? `${reference.catalogue} ${reference.value}` : reference.value}
        </Box>
      ))}
    </Box>
  )
}

// Das Titelblatt als eigene Karte, zentriert und Zeile fuer Zeile wie im Druck.
// Ohne eigene Ueberschrift, die traegt der umgebende Abschnitt.
export function SourceTitlePage({ title }: { title: string }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.default',
        px: { xs: 2, sm: 3 },
        py: 2.5,
        textAlign: 'center',
        lineHeight: 1.7,
        overflowWrap: 'anywhere',
      }}
    >
      <SourceTitle title={title} />
    </Box>
  )
}
