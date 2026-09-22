"use client"
import { useMemo, useState } from "react"
import type { KnowledgePage } from "../lib/knowledge-model"
import { pagesForTag } from "../lib/knowledge-tags"
export function TagPage({ pages, section, tag, onOpen, onCreate }: { pages: KnowledgePage[]; section: string; tag: string; onOpen: (page: KnowledgePage) => void; onCreate?: () => void }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState("recent")
  const visible = useMemo(() => pagesForTag(pages, section, tag).filter((page) => `${page.title} ${page.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "pt-BR") : b.createdAt - a.createdAt), [pages, section, tag, query, sort])
  return <div><div className="knowledge-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option><option value="name">Nome A–Z</option></select>{onCreate && <button className="primary-button" onClick={onCreate}>Criar Novo</button>}</div><div className="knowledge-grid">{visible.map((page) => <button className="knowledge-card" key={page.id} onClick={() => onOpen(page)}><strong>{page.title}</strong><small>{page.summary}</small></button>)}</div></div>
}

