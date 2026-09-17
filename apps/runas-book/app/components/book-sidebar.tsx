"use client"

import { memo } from "react"
import { ChevronDown, ChevronRight, ChevronUp, FileText, Plus, Trash2 } from "lucide-react"
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
  onDeleteChapter: (chapterId: string) => void
  onMoveChapter: (chapterId: string, offset: -1 | 1) => void
}

// Memorizada: digitar na busca ou em modais não precisa redesenhar a árvore de tópicos.
export const BookSidebar = memo(function BookSidebar({ book, isDm, expanded, activeChapterId, activeEntryId, onToggleChapter, onSelectChapter, onSelectEntry, onAddChapter, onAddEntry, onDeleteChapter, onMoveChapter }: Props) {
  const chapters = [...book.chapters].sort((left: BookChapter, right: BookChapter) => left.order - right.order)
  return <aside className="book-sidebar">
    <div className="sidebar-heading"><span>Tópicos</span>{isDm && <button className="mini-action" onClick={onAddChapter} title="Novo tópico"><Plus size={15} /></button>}</div>
    <nav className="sidebar-tree">
      {chapters.map((chapter, index) => {
        // `expanded` é a única fonte de verdade da abertura. Navegar para um
        // tópico já o adiciona ao conjunto, então forçá-lo aberto por ser o
        // ativo só impedia fechá-lo enquanto se lia uma página dele.
        const isOpen = expanded.has(chapter.id)
        const isActiveTopic = chapter.id === activeChapterId && !activeEntryId
        return <div key={chapter.id} className="topic-group">
          <div className={`topic-row ${isActiveTopic ? "active" : ""}`}>
            <button className="topic-toggle" onClick={() => onToggleChapter(chapter.id)} aria-label={isOpen ? "Recolher tópico" : "Expandir tópico"}><ChevronRight size={15} className={isOpen ? "chevron open" : "chevron"} /></button>
            <button className="topic-label" onClick={() => onSelectChapter(chapter.id)}>{chapter.title}</button>
            {isDm && <button className="topic-move" disabled={index === 0} onClick={() => onMoveChapter(chapter.id, -1)} title="Mover tópico para cima" aria-label={`Mover “${chapter.title}” para cima`}><ChevronUp size={13} /></button>}
            {isDm && <button className="topic-move" disabled={index === chapters.length - 1} onClick={() => onMoveChapter(chapter.id, 1)} title="Mover tópico para baixo" aria-label={`Mover “${chapter.title}” para baixo`}><ChevronDown size={13} /></button>}
            {isDm && <button className="topic-add" onClick={() => onAddEntry(chapter.id)} title="Nova página neste tópico"><Plus size={13} /></button>}
            {isDm && <button className="topic-delete" onClick={() => onDeleteChapter(chapter.id)} title="Excluir tópico"><Trash2 size={13} /></button>}
          </div>
          {isOpen && <div className="page-list">
            {chapter.entries.length === 0 && <p className="page-list-empty">Sem páginas ainda.</p>}
            {chapter.entries.map((page) => <button key={page.id} className={`page-row ${page.id === activeEntryId ? "active" : ""}`} onClick={() => onSelectEntry(chapter.id, page.id)}><FileText size={13} /><span>{page.title}</span></button>)}
          </div>}
        </div>
      })}
    </nav>
  </aside>
})
