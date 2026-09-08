"use client"

import { useState } from "react"
import { fictionalYear, formatFictionalYear, type UniverseEra } from "../lib/chronology"
import { plainTextFromHtml, type KnowledgePage } from "../lib/knowledge-model"

export function EraHeading({ era, onChange }: { era: UniverseEra; onChange: (era: UniverseEra) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(era)
  const [startText, setStartText] = useState(String(era.startYear ?? ""))
  const [endText, setEndText] = useState(String(era.endYear ?? ""))
  const [error, setError] = useState("")
  return <section className="era-heading"><div><p className="eyebrow">Linha do tempo do universo</p><h2>{era.name}</h2><p><strong>Início:</strong> {formatFictionalYear(era.startYear, era.calendar)} · <strong>Fim:</strong> {formatFictionalYear(era.endYear, era.calendar)}</p>{era.note && <small>{era.note}</small>}</div>
    <button className="secondary-button" onClick={() => { setDraft(era); setStartText(String(era.startYear ?? "")); setEndText(String(era.endYear ?? "")); setEditing((value) => !value); setError("") }}>Editar era</button>
    {editing && <form className="era-form" onSubmit={(event) => { event.preventDefault(); const startYear = fictionalYear(startText), endYear = fictionalYear(endText); if ((startText.trim() && startYear == null) || (endText.trim() && endYear == null)) { setError("Informe anos inteiros ou deixe os limites em branco."); return }; if (startYear != null && endYear != null && startYear > endYear) { setError("O fim precisa ser igual ou posterior ao início."); return }; onChange({ ...draft, startYear, endYear }); setEditing(false) }}>
      <label>Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Calendário<input required value={draft.calendar} onChange={(event) => setDraft({ ...draft, calendar: event.target.value })} /></label>
      <label>Ano de início<input inputMode="numeric" value={startText} onChange={(event) => setStartText(event.target.value)} /></label>
      <label>Ano de fim<input inputMode="numeric" value={endText} onChange={(event) => setEndText(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button className="primary-button" type="submit">Salvar era</button><button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancelar</button>
    </form>}
  </section>
}

export function ChronologyTimeline({ pages, era, onOpen }: { pages: KnowledgePage[]; era?: UniverseEra; onOpen: (page: KnowledgePage) => void }) {
  if (!pages.length) return <div className="knowledge-empty"><strong>Nenhum evento nesta seleção.</strong><p>Crie um evento ou ajuste a era e os filtros.</p></div>
  return <div className="chronology-timeline">{pages.map((page) => <button className="chronology-event" key={page.id} onClick={() => onOpen(page)}><span className="chronology-year">{formatFictionalYear(page.eventYear, era?.calendar)}</span><span className="chronology-dot" /><div><small>{page.tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}</small><h2>{page.title}</h2><p>{page.summary || plainTextFromHtml(page.contentHtml).slice(0, 220) || "Sem descrição."}</p><small className="chronology-created">Criado em {new Date(page.createdAt).toLocaleDateString("pt-BR")}</small></div></button>)}</div>
}
