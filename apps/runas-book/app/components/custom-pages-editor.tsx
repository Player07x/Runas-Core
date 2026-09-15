"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Check, FileStack, Plus, Trash2, X } from "lucide-react"
import { createCustomPage, type BookCustomPage } from "../lib/book-model"
import { RichTextEditor } from "./rich-text-editor"

interface Props {
  pages: BookCustomPage[]
  onSave: (pages: BookCustomPage[]) => void
  onClose: () => void
}

export function CustomPagesEditor({ pages, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<BookCustomPage[]>(() => [...pages].sort((left, right) => left.order - right.order))
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = draft.find((page) => page.id === editingId) ?? null

  function commit(next: BookCustomPage[]) {
    setDraft(next.map((page, index) => ({ ...page, order: index })))
  }

  function addPage() {
    const page = createCustomPage(draft.length)
    commit([...draft, page])
    setEditingId(page.id)
  }

  function updatePage(next: BookCustomPage) {
    commit(draft.map((page) => page.id === next.id ? { ...next, updatedAt: Date.now() } : page))
  }

  function removePage(id: string) {
    commit(draft.filter((page) => page.id !== id))
    setEditingId(null)
  }

  function move(id: string, direction: -1 | 1) {
    const index = draft.findIndex((page) => page.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }

  if (editing) {
    return <div className="modal-backdrop" onMouseDown={() => setEditingId(null)}>
      <section className="modal-card editor-modal custom-page-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Página customizada</p><h2>{editing.title || "Nova página"}</h2></div><button className="icon-link" onClick={() => setEditingId(null)}><X size={18} /></button></header>
        <label>Título<input className="form-input" value={editing.title} onChange={(event) => updatePage({ ...editing, title: event.target.value })} autoFocus /></label>
        <RichTextEditor label="Conteúdo" className="page-content-editor" value={editing.content} onChange={(content) => updatePage({ ...editing, content })} />
        <div className="editor-actions">
          <button className="danger-action" onClick={() => removePage(editing.id)}><Trash2 size={15} /> Excluir página</button>
          <button className="primary-action" onClick={() => setEditingId(null)}><Check size={15} /> Concluído</button>
        </div>
      </section>
    </div>
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card editor-modal custom-pages-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">Exportação do livro</p><h2>Páginas customizadas</h2><p>Entram entre o sumário e os capítulos, na ordem abaixo — texto, imagem ou tabela livres.</p></div><button className="icon-link" onClick={onClose}><X size={18} /></button></header>

      {draft.length === 0 && <p className="page-copy-empty">Nenhuma página customizada ainda.</p>}
      <div className="resource-manage-list">
        {draft.map((page, index) => <div key={page.id} className="custom-page-row">
          <button className="resource-manage-row" onClick={() => setEditingId(page.id)}><FileStack size={15} /><span>{page.title || "Sem título"}</span></button>
          <div className="custom-page-row-actions">
            <button className="icon-link" disabled={index === 0} onClick={() => move(page.id, -1)} aria-label="Mover para cima"><ArrowUp size={15} /></button>
            <button className="icon-link" disabled={index === draft.length - 1} onClick={() => move(page.id, 1)} aria-label="Mover para baixo"><ArrowDown size={15} /></button>
          </div>
        </div>)}
      </div>
      <button className="outline-action" onClick={addPage}><Plus size={15} /> Nova página customizada</button>

      <div className="editor-actions">
        <button className="outline-action" onClick={onClose}><X size={15} /> Cancelar</button>
        <button className="primary-action" onClick={() => onSave(draft)}><Check size={15} /> Salvar páginas</button>
      </div>
    </section>
  </div>
}
