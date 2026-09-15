"use client"

import { ChevronRight, FileText, Plus } from "lucide-react"
import type { BookChapter, BookRecord } from "../lib/book-model"

interface Props {
  book: BookRecord
  isDm: boolean
  expanded: Set<string>
  activeChapterId: string | null
  activeEntryId: string | null
  onToggleChapter: (chapterId: string) => void
  onSelectChapter: (chapterId: string) => void
  onSelectEntry: (chapterId: string, entryId: string) => void
  onAddChapter: () => void
  onAddEntry: (chapterId: string) => void
}

export function BookSidebar({ book, isDm, expanded, activeChapterId, activeEntryId, onToggleChapter, onSelectChapter, onSelectEntry, onAddChapter, onAddEntry }: Props) {
  const chapters = [...book.chapters].sort((left: BookChapter, right: BookChapter) => left.order - right.order)
  return <aside className="book-sidebar">
    <div className="sidebar-heading"><span>Tópicos</span>{isDm && <button className="mini-action" onClick={onAddChapter} title="Novo tópico"><Plus size={15} /></button>}</div>
    <nav className="sidebar-tree">
      {chapters.map((chapter) => {
        const isOpen = expanded.has(chapter.id) || chapter.id === activeChapterId
        const isActiveTopic = chapter.id === activeChapterId && !activeEntryId
        return <div key={chapter.id} className="topic-group">
          <div className={`topic-row ${isActiveTopic ? "active" : ""}`}>
            <button className="topic-toggle" onClick={() => onToggleChapter(chapter.id)} aria-label={isOpen ? "Recolher tópico" : "Expandir tópico"}><ChevronRight size={15} className={isOpen ? "chevron open" : "chevron"} /></button>
            <button className="topic-label" onClick={() => onSelectChapter(chapter.id)}>{chapter.title}</button>
            {isDm && <button className="topic-add" onClick={() => onAddEntry(chapter.id)} title="Nova página neste tópico"><Plus size={13} /></button>}
          </div>
          {isOpen && <div className="page-list">
            {chapter.entries.length === 0 && <p className="page-list-empty">Sem páginas ainda.</p>}
            {chapter.entries.map((page) => <button key={page.id} className={`page-row ${page.id === activeEntryId ? "active" : ""}`} onClick={() => onSelectEntry(chapter.id, page.id)}><FileText size={13} /><span>{page.title}</span></button>)}
          </div>}
        </div>
      })}
    </nav>
  </aside>
}
