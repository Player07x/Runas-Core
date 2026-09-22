"use client"

import { Pencil } from "lucide-react"
import { erasForYear, resolveEra, type UniverseEra } from "../lib/chronology"
import type { KnowledgePage } from "../lib/knowledge-model"
import { ChronologyTimeline, EraHeading } from "./chronology-timeline"
import { KnowledgeCardImage } from "./knowledge-card-image"
import { RichTextView } from "./rich-text-editor"
import { SubpageHeader } from "./subpage-header"

export function ChronologyEraPage({ page, legacyEra, eras, pages, onBack, onEdit, onChangeLegacy, onOpen }: { page?: KnowledgePage; legacyEra?: UniverseEra; eras: UniverseEra[]; pages: KnowledgePage[]; onBack: () => void; onEdit: (page: KnowledgePage) => void; onChangeLegacy: (era: UniverseEra) => void; onOpen: (page: KnowledgePage) => void }) {
  const era = page ? { id: page.id, name: page.title, startYear: page.eraStartYear ?? null, endYear: page.eraEndYear ?? null, calendar: page.eraCalendar ?? "C.E.", note: page.summary } : legacyEra
  if (!era) return null
  const storedId = page?.id.startsWith("era-") ? page.id.slice(4) : page?.id
  const events = pages.filter((candidate) => candidate.scope === "wiki" && candidate.kind === "event" && (page ? erasForYear(candidate.eventYear, [page]).length > 0 || candidate.tags.includes(page.title) || candidate.eraId === storedId : resolveEra(candidate.eventYear, eras, candidate.eraId)?.id === era.id)).sort((a, b) => (a.eventYear ?? Number.POSITIVE_INFINITY) - (b.eventYear ?? Number.POSITIVE_INFINITY))
  return <section className="chronology-era-page"><SubpageHeader title={page ? era.name : "Cronologia"} onBack={onBack} />{page ? <div className="era-page-intro"><div><p className="eyebrow">Era · {era.calendar}</p>{page.summary && <p>{page.summary}</p>}</div><button className="secondary-button" onClick={() => onEdit(page)}><Pencil size={15} /> Editar página</button></div> : <EraHeading era={era} onChange={onChangeLegacy} />}{page && <><KnowledgeCardImage page={page} />{page.contentHtml && <RichTextView html={page.contentHtml} pages={pages} onOpenPage={onOpen} />}</>}<div className="era-page-timeline"><h3>Linha do tempo</h3><ChronologyTimeline pages={events} era={era} stories={pages.filter((candidate) => candidate.kind === "story")} onOpen={onOpen} /></div></section>
}
