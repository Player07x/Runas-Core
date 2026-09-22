"use client"
import { useMemo, useState } from "react"
import type { KnowledgePage } from "../lib/knowledge-model"
import { pagesForTag } from "../lib/knowledge-tags"
import { SubpageHeader } from "./subpage-header"
export function TagPage({ pages, section, tag, onOpen, onCreate, onBack }: { pages: KnowledgePage[]; section: string; tag: string; onOpen: (page: KnowledgePage) => void; onCreate?: () => void; onBack?: () => void }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState("recent")
  const visible = useMemo(() => pagesForTag(pages, section, tag).filter((page) => `${page.title} ${page.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "pt-BR") : (sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)), [pages, section, tag, query, sort])
  return <div><SubpageHeader title={`Tag · ${tag}`} onBack={onBack ?? (() => { if (typeof window !== "undefined") window.history.back() })} /><div className="knowledge-toolbar tag-page-header"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nesta tag" /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option><option value="name">Nome A–Z</option></select>{onCreate && <button className="primary-button" onClick={onCreate}>Criar Novo</button>}</div>{visible.length === 0 ? <div className="knowledge-empty"><strong>Nenhuma página nesta tag.</strong></div> : <div className="knowledge-grid">{visible.map((page) => <button className="knowledge-card" key={page.id} onClick={() => onOpen(page)}><strong>{page.title}</strong><small>{page.summary || "Sem resumo."}</small></button>)}</div>}</div>
}
