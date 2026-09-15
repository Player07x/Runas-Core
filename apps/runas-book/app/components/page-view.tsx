"use client"

import { useEffect, useMemo, useRef } from "react"
import { ChevronRight, Download, FileText, Pencil, Sparkles } from "lucide-react"
import { CHARACTER_VERSION } from "@runas/core/types/character"
import { allEntries, buildPageIndex, kindLabel, normalizeLinkTarget, slugify, type BookChapter, type BookEntry, type BookRecord, type BookResource } from "../lib/book-model"
import { sanitizeRichText, wikiTitlesFromRichText } from "./rich-text-editor"
import { exportPageResources, exportResource, ResourceCard } from "./resource-panel"

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

interface Props {
  book: BookRecord
  chapter: BookChapter
  entry: BookEntry
  isDm: boolean
  onOpenBooks: () => void
  onOpenTopic: (chapterId: string) => void
  onOpenEntry: (chapterId: string, entryId: string) => void
  onEdit: () => void
  onEditResource: (resource: BookResource) => void
}

export function PageView({ book, chapter, entry, isDm, onOpenBooks, onOpenTopic, onOpenEntry, onEdit, onEditResource }: Props) {
  const pageIndex = useMemo(() => buildPageIndex(book), [book])
  const contentRef = useRef<HTMLDivElement>(null)
  const safeContent = useMemo(() => sanitizeRichText(entry.content), [entry.content])
  const backlinks = useMemo(() => {
    const targetKey = normalizeLinkTarget(entry.title)
    return allEntries(book).filter((candidate) => candidate.id !== entry.id && wikiTitlesFromRichText(candidate.content).some((title) => normalizeLinkTarget(title) === targetKey))
  }, [book, entry])

  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    container.querySelectorAll<HTMLAnchorElement>("a[data-wiki-title]").forEach((anchor) => {
      const title = anchor.dataset.wikiTitle?.trim() ?? ""
      const exists = pageIndex.has(normalizeLinkTarget(title))
      anchor.classList.toggle("wikilink-broken", !exists)
      anchor.title = exists ? "" : "Página não encontrada nesta wiki"
    })
  }, [safeContent, pageIndex])

  function handleContentClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-wiki-title]")
    if (!anchor || !contentRef.current?.contains(anchor)) return
    const title = anchor.dataset.wikiTitle?.trim()
    const target = title ? pageIndex.get(normalizeLinkTarget(title)) : null
    if (!target) return
    event.preventDefault()
    onOpenEntry(target.chapterId, target.id)
  }

  return <article className="page-article">
    <nav className="breadcrumb">
      <button onClick={onOpenBooks}>{book.title}</button>
      <ChevronRight size={13} />
      <button onClick={() => onOpenTopic(chapter.id)}>{chapter.title}</button>
      <ChevronRight size={13} />
      <span>{entry.title}</span>
    </nav>

    <header className="page-header">
      <span className={`entry-type type-${entry.kind}`}>{kindLabel(entry.kind)}</span>
      <h1>{entry.title}</h1>
      {entry.summary && <p className="page-summary">{entry.summary}</p>}
      {isDm && <button className="outline-action" onClick={onEdit}><Pencil size={15} /> Editar página</button>}
    </header>

    {entry.kind === "character" && entry.entity && <div className="character-summary">
      <div className="resource-grid-fields">
        <div className="resource-field"><span>Nome</span><strong>{entry.entity.name || "—"}</strong></div>
        <div className="resource-field"><span>Raça</span><strong>{entry.entity.info.race || "—"}</strong></div>
        <div className="resource-field"><span>Classe</span><strong>{entry.entity.info.characterClass || "—"}</strong></div>
        <div className="resource-field"><span>Afinidade</span><strong>{entry.entity.info.affinity || "—"}</strong></div>
      </div>
      <button className="outline-action" onClick={() => downloadJson(`${slugify(entry.entity!.name || entry.title)}.json`, { version: CHARACTER_VERSION, character: entry.entity })}><Download size={15} /> Exportar ficha</button>
    </div>}

    {safeContent
      ? <div ref={contentRef} className="page-copy rich-text-content" onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: safeContent }} />
      : <p className="page-copy-empty">Esta página ainda não tem conteúdo. {isDm ? "Use “Editar página” para escrever o texto completo." : "Volte em breve para o conteúdo completo."}</p>}

    {entry.resources.length > 0 && <section className="resource-section">
      <h2>Recursos desta página</h2>
      <div className="resource-grid">{entry.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} onExport={() => exportResource(resource, slugify)} onEdit={isDm ? () => onEditResource(resource) : undefined} editable={isDm} />)}</div>
      <button className="primary-action" onClick={() => exportPageResources(entry.title, entry.resources, slugify)}><Download size={16} /> Exportar todos os recursos da página</button>
    </section>}

    {backlinks.length > 0 && <section className="backlinks-section">
      <h2><Sparkles size={15} /> Páginas vinculadas</h2>
      <div className="backlinks-list">{backlinks.map((page) => <button key={page.id} className="backlink-chip" onClick={() => onOpenEntry(page.chapterId, page.id)}><FileText size={13} /> {page.title}</button>)}</div>
    </section>}
  </article>
}
