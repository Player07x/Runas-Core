"use client"

import { useMemo } from "react"
import { ChevronRight, Download, FileText, Pencil, Sparkles } from "lucide-react"
import { CHARACTER_VERSION } from "@runas/core/types/character"
import { buildPageIndex, findBacklinks, kindLabel, parseWikilinks, slugify, type BookChapter, type BookEntry, type BookRecord, type BookResource } from "../lib/book-model"
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
  const backlinks = useMemo(() => findBacklinks(book, entry), [book, entry])
  const paragraphs = entry.content.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0)

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

    {paragraphs.length > 0
      ? <div className="page-copy">{paragraphs.map((paragraph, index) => <p key={index}>{parseWikilinks(paragraph, pageIndex).map((token, tokenIndex) => token.type === "text"
          ? <span key={tokenIndex}>{token.value}</span>
          : token.entry
            ? <button key={tokenIndex} className="wikilink" onClick={() => onOpenEntry(token.entry!.chapterId, token.entry!.id)}>{token.label}</button>
            : <span key={tokenIndex} className="wikilink broken" title="Página não encontrada nesta wiki">{token.label}</span>)}</p>)}</div>
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
