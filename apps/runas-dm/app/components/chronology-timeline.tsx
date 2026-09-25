"use client"

import { useState, useSyncExternalStore } from "react"
import { Columns2, Columns3, List } from "lucide-react"
import { formatCalendarYears, parseCalendarYear, type UniverseEra } from "../lib/chronology"
import { plainTextFromHtml, type KnowledgePage } from "../lib/knowledge-model"
import { CHRONOLOGY_COLUMNS_STORAGE_KEY } from "../lib/ui-preferences"

export type ChronologyColumns = 1 | 2 | 3

const columnListeners = new Set<() => void>()
let cachedColumns: ChronologyColumns | null = null

function readStoredColumns(): ChronologyColumns {
  const raw = window.localStorage.getItem(CHRONOLOGY_COLUMNS_STORAGE_KEY)
  return raw === "2" ? 2 : raw === "3" ? 3 : 1
}

function subscribeColumns(listener: () => void) {
  columnListeners.add(listener)
  return () => columnListeners.delete(listener)
}

function getColumnsSnapshot(): ChronologyColumns {
  if (cachedColumns == null) cachedColumns = readStoredColumns()
  return cachedColumns
}

function getServerColumnsSnapshot(): ChronologyColumns {
  return 1
}

export function setChronologyColumns(value: ChronologyColumns) {
  cachedColumns = value
  window.localStorage.setItem(CHRONOLOGY_COLUMNS_STORAGE_KEY, String(value))
  columnListeners.forEach((listener) => listener())
}

/**
 * Preferência compartilhada por toda a Wiki e Campanhas: mudar aqui muda
 * todas as linhas cronológicas ao mesmo tempo, sem precisar repassar prop
 * pelos quatro lugares que renderizam `ChronologyTimeline`.
 */
export function useChronologyColumns(): ChronologyColumns {
  return useSyncExternalStore(subscribeColumns, getColumnsSnapshot, getServerColumnsSnapshot)
}

const COLUMN_OPTIONS: Array<{ value: ChronologyColumns; icon: typeof List; label: string }> = [
  { value: 1, icon: List, label: "1 coluna" },
  { value: 2, icon: Columns2, label: "2 colunas" },
  { value: 3, icon: Columns3, label: "3 colunas" },
]

export function ChronologyColumnsControl() {
  const columns = useChronologyColumns()
  return <div className="chronology-columns-control" aria-label="Colunas da linha do tempo">
    {COLUMN_OPTIONS.map(({ value, icon: Icon, label }) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={columns === value} onClick={() => setChronologyColumns(value)}><Icon size={13} /></button>)}
  </div>
}

export function EraHeading({ era, onChange }: { era: UniverseEra; onChange: (era: UniverseEra) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(era)
  const [startText, setStartText] = useState(String(era.startYear ?? ""))
  const [endText, setEndText] = useState(String(era.endYear ?? ""))
  const [error, setError] = useState("")
  return <section className="era-heading"><div><p className="eyebrow">Linha do tempo do universo</p><h2>{era.name}</h2><p><strong>Início:</strong> {formatCalendarYears(era.startYear, era.calendar)} · <strong>Fim:</strong> {formatCalendarYears(era.endYear, era.calendar)}</p>{era.note && <small>{era.note}</small>}</div>
    <button className="secondary-button" onClick={() => { setDraft(era); setStartText(String(era.startYear ?? "")); setEndText(String(era.endYear ?? "")); setEditing((value) => !value); setError("") }}>Editar era</button>
    {editing && <form className="era-form" onSubmit={(event) => { event.preventDefault(); const startYear = parseCalendarYear(startText), endYear = parseCalendarYear(endText); if ((startText.trim() && startYear == null) || (endText.trim() && endYear == null)) { setError("Informe anos inteiros, com ou sem calendário (4027 C.E. ou 0 Logi)."); return }; if (startYear != null && endYear != null && startYear > endYear) { setError("O fim precisa ser igual ou posterior ao início."); return }; onChange({ ...draft, startYear, endYear }); setEditing(false) }}>
      <label>Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Calendário<input required value={draft.calendar} onChange={(event) => setDraft({ ...draft, calendar: event.target.value })} /></label>
      <label>Ano de início<input value={startText} onChange={(event) => setStartText(event.target.value)} placeholder="4027 C.E. ou 0 Logi" /></label>
      <label>Ano de fim<input value={endText} onChange={(event) => setEndText(event.target.value)} placeholder="4027 C.E. ou 0 Logi" /></label>
      {error && <p role="alert">{error}</p>}<button className="primary-button" type="submit">Salvar era</button><button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancelar</button>
    </form>}
  </section>
}

/** `stories` traz as Histórias para identificar de qual delas cada acontecimento veio. */
export function ChronologyTimeline({ pages, era, stories = [], onOpen }: { pages: KnowledgePage[]; era?: UniverseEra; stories?: KnowledgePage[]; onOpen: (page: KnowledgePage) => void }) {
  const columns = useChronologyColumns()
  if (!pages.length) return <div className="knowledge-empty"><strong>Nenhum acontecimento nesta seleção.</strong><p>Crie um acontecimento ou ajuste a era e os filtros.</p></div>
  return <div className="chronology-timeline" data-columns={columns}>{pages.map((page) => {
    const story = stories.find((candidate) => candidate.storyEventIds.includes(page.id))
    return <button className={`chronology-event ${story ? "from-story" : ""}`} key={page.id} onClick={() => onOpen(page)}><span className="chronology-year">{formatCalendarYears(page.eventYear, era?.calendar)}</span><span className="chronology-dot" /><div><small>{page.tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}</small><h2>{page.title}</h2><p>{page.summary || plainTextFromHtml(page.contentHtml).slice(0, 220) || "Sem descrição."}</p><small className="chronology-created">{story ? `História: ${story.title || "sem nome"}` : `Criado em ${new Date(page.createdAt).toLocaleDateString("pt-BR")}`}</small></div></button>
  })}</div>
}
