"use client"

import { BookOpen, Link2, Plus, Unlink } from "lucide-react"
import type { UniverseEra } from "../lib/chronology"
import { erasForYear, resolveEra } from "../lib/chronology"
import type { KnowledgePage } from "../lib/knowledge-model"
import { ChronologyTimeline } from "./chronology-timeline"

export function CampaignStory({ stories, allStories, pages, eras, onCreate, onLink, onUnlink, onOpenStory }: { stories: KnowledgePage[]; allStories: KnowledgePage[]; pages: KnowledgePage[]; eras: UniverseEra[]; onCreate: () => void; onLink: (id: string) => void; onUnlink: (id: string) => void; onOpenStory: (story: KnowledgePage) => void }) {
  const events = stories.flatMap((story) => story.storyEventIds.map((id) => ({ story, event: pages.find((page) => page.id === id) })).filter((item): item is { story: KnowledgePage; event: KnowledgePage } => Boolean(item.event))).sort((left, right) => (left.event.eventYear ?? Number.POSITIVE_INFINITY) - (right.event.eventYear ?? Number.POSITIVE_INFINITY))
  const eraPages = pages.filter((page) => page.scope === "wiki" && page.kind === "chronology")
  const eraForGroup = (key: string): UniverseEra | undefined => {
    const page = eraPages.find((candidate) => candidate.id === key)
    return page ? { id: page.id, name: page.title, startYear: page.eraStartYear ?? null, endYear: page.eraEndYear ?? null, calendar: page.eraCalendar ?? "C.E.", note: page.summary } : eras.find((era) => era.id === key)
  }
  const groups = new Map<string, typeof events>()
  for (const item of events) {
    const eraPage = erasForYear(item.event.eventYear, eraPages)[0] ?? eraPages.find((page) => item.event.tags.includes(page.title))
    const key = eraPage?.id ?? resolveEra(item.event.eventYear, eras, item.event.eraId)?.id ?? "unassigned"
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return <section className="campaign-subpage campaign-story-panel"><header className="campaign-subpage-heading"><div><p className="eyebrow">Campanha</p><h2>História</h2><p>Reúna as histórias vinculadas e a cronologia desta campanha.</p></div><button className="primary-button" onClick={onCreate}><Plus size={16} /> Criar História</button></header><div className="subpage-actions"><label><span>Vincular História existente</span><select defaultValue="" onChange={(event) => { if (event.target.value) onLink(event.target.value); event.currentTarget.value = "" }}><option value="">Escolha uma História…</option>{allStories.filter((story) => !stories.some((linked) => linked.id === story.id)).map((story) => <option key={story.id} value={story.id}>{story.title || "História sem nome"}</option>)}</select></label><span className="subpage-count"><BookOpen size={15} /> {stories.length} vinculada{stories.length === 1 ? "" : "s"}</span></div>{stories.length > 0 && <div className="linked-story-list">{stories.map((story) => <article key={story.id}><button onClick={() => onOpenStory(story)}><BookOpen size={19} /><span><strong>{story.title || "História sem nome"}</strong><small>{story.storyEventIds.length} acontecimento{story.storyEventIds.length === 1 ? "" : "s"}</small></span></button><button className="icon-button" onClick={() => onUnlink(story.id)} aria-label={`Desvincular ${story.title}`}><Unlink size={15} /></button></article>)}</div>}{events.length > 0 ? <div className="campaign-chronology"><header><h3>Cronologia agregada</h3><span>{events.length} acontecimentos</span></header>{[...groups.entries()].map(([key, items]) => <section key={key}><h4>{eraForGroup(key)?.name ?? "Sem era definida"}</h4><ChronologyTimeline pages={items.map(({ event }) => event)} era={eraForGroup(key)} stories={stories} onOpen={(event) => { const story = items.find((item) => item.event.id === event.id)?.story; if (story) onOpenStory(story) }} /></section>)}</div> : <div className="knowledge-empty"><Link2 size={28} /><strong>Nenhum acontecimento agregado.</strong><p>Adicione acontecimentos nas histórias vinculadas para formar a cronologia da campanha.</p></div>}</section>
}
