"use client"
import { useMemo, useState } from "react"
import type { KnowledgePage } from "../lib/knowledge-model"
import { pagesForTag } from "../lib/knowledge-tags"
import { SubpageHeader } from "./subpage-header"
import { KnowledgeCardImage } from "./knowledge-card-image"
export function TagPage({ pages, section, tag, onOpen, onCreate, onBack }: { pages: KnowledgePage[]; section: string; tag: string; onOpen: (page: KnowledgePage) => void; onCreate?: () => void; onBack?: () => void }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState("recent")
  const isStory = section === "story" && !tag
  /**
   * Em História, "Acontecimentos" reúne os que não pertencem a nenhuma
   * História. Eles existiam soltos e apareciam misturados às eras da
   * Cronologia; aqui têm lugar próprio, sem deixar de ser `kind: "event"`.
   */
  const [storyTab, setStoryTab] = useState<"stories" | "events">("stories")
  const orphanEvents = useMemo(() => {
    const anexados = new Set(pages.flatMap((page) => page.kind === "story" ? page.storyEventIds : []))
    return pages.filter((page) => page.scope === "wiki" && page.kind === "event" && !anexados.has(page.id))
  }, [pages])
  const showingEvents = isStory && storyTab === "events"
  const visible = useMemo(() => {
    const fictionalDate = (page: KnowledgePage) => page.kind === "story" ? Math.min(...page.storyEventIds.map((id) => pages.find((event) => event.id === id)?.eventYear ?? Number.POSITIVE_INFINITY)) : page.eventYear ?? Number.POSITIVE_INFINITY
    const base = showingEvents ? orphanEvents : isStory ? pages.filter((page) => page.scope === "wiki" && page.kind === "story") : pagesForTag(pages, section, tag)
    return base.filter((page) => `${page.title} ${page.summary}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "pt-BR") : sort === "fictional" ? fictionalDate(a) - fictionalDate(b) : sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)
  }, [pages, section, tag, query, sort, isStory, showingEvents, orphanEvents])
  return <div className="tag-page">{isStory ? <><h2 className="section-title">História</h2><nav className="story-tabs" aria-label="Seções de História"><button type="button" className={storyTab === "stories" ? "active" : ""} aria-pressed={storyTab === "stories"} onClick={() => setStoryTab("stories")}>Histórias</button><button type="button" className={storyTab === "events" ? "active" : ""} aria-pressed={storyTab === "events"} onClick={() => setStoryTab("events")}>Acontecimentos ({orphanEvents.length})</button></nav></> : <SubpageHeader title={`Tag · ${tag}`} onBack={onBack ?? (() => { if (typeof window !== "undefined") window.history.back() })} />}<div className="knowledge-toolbar tag-page-header"><input aria-label="Pesquisar páginas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={showingEvents ? "Pesquisar acontecimentos" : isStory ? "Pesquisar histórias" : "Pesquisar nesta tag"} /><select aria-label="Ordenar páginas" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Criação: mais recentes</option><option value="oldest">Criação: mais antigas</option>{isStory && <option value="fictional">Data fictícia</option>}<option value="name">Nome A–Z</option></select>{onCreate && <button className="primary-button" onClick={onCreate}>{isStory ? "Nova História" : "Criar Novo"}</button>}</div>{visible.length === 0 ? <div className="knowledge-empty"><strong>{isStory ? "Nenhuma História encontrada." : "Nenhuma página nesta tag."}</strong></div> : <div className="knowledge-grid document-grid">{visible.map((page) => <button className="knowledge-card document-card" key={page.id} onClick={() => onOpen(page)}><KnowledgeCardImage page={page} /><span className="document-card-copy"><strong>{page.title || "Página sem nome"}</strong><small className="document-summary">{page.summary || "Sem resumo."}</small><span className="document-meta">Criado em {new Date(page.createdAt).toLocaleDateString("pt-BR")}{page.tags.length > 0 && !isStory && <span>{page.tags.slice(0, 3).map((name) => `#${name}`).join(" · ")}</span>}</span></span></button>)}</div>}</div>
}
