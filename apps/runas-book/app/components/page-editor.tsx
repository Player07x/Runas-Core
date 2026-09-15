"use client"

import { useState } from "react"
import { Check, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react"
import { createResource, resourceKindLabel, type BookEntry, type BookEntryKind, type BookResource, type BookResourceKind } from "../lib/book-model"
import { ResourceEditorDialog } from "./resource-panel"

interface Props {
  entry: BookEntry
  onSave: (entry: BookEntry) => void
  onCancel: () => void
  onDelete: () => void
}

export function PageEditor({ entry, onSave, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<BookEntry>(() => ({ ...entry, resources: entry.resources.map((resource) => ({ ...resource })) }))
  const [editingResource, setEditingResource] = useState<BookResource | null>(null)

  function addResource(kind: BookResourceKind) {
    const resource = createResource(kind, "Novo registro")
    setDraft((current) => ({ ...current, resources: [...current.resources, resource] }))
    setEditingResource(resource)
  }

  function saveResource(next: BookResource) {
    setDraft((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === next.id ? next : resource) }))
    setEditingResource(null)
  }

  function deleteResource(id: string) {
    setDraft((current) => ({ ...current, resources: current.resources.filter((resource) => resource.id !== id) }))
    setEditingResource(null)
  }

  return <article className="page-article page-editor">
    <header className="page-header editor-header">
      <p className="eyebrow">Modo de edição</p>
      <input className="form-input title-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título da página" />
      <div className="field-row">
        <label>Tipo<select className="form-input" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as BookEntryKind })}><option value="rule">Página de regra</option><option value="character">Ficha completa</option></select></label>
      </div>
      <label>Resumo<input className="form-input" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Uma linha para a grade e a busca" /></label>
    </header>

    <label className="content-label">Conteúdo<textarea className="form-input content-textarea" rows={14} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva o texto completo da página… use [[Nome de outra página]] para linkar internamente, como no Obsidian." /></label>

    <section className="resource-section editor-resources">
      <h2>Recursos anexados</h2>
      {draft.resources.length === 0 && <p className="page-copy-empty">Nenhum item, habilidade ou magia anexado ainda.</p>}
      <div className="resource-manage-list">{draft.resources.map((resource) => <button key={resource.id} className="resource-manage-row" onClick={() => setEditingResource(resource)}><span className={`entry-type type-${resource.kind}`}>{resourceKindLabel(resource.kind)}</span><span>{resource.entity.name}</span></button>)}</div>
      <div className="resource-add-row">
        <button className="outline-action" onClick={() => addResource("item")}><Plus size={15} /> Item</button>
        <button className="outline-action" onClick={() => addResource("ability")}><Sparkles size={15} /> Habilidade</button>
        <button className="outline-action" onClick={() => addResource("spell")}><Wand2 size={15} /> Magia</button>
      </div>
    </section>

    <div className="editor-actions page-editor-actions">
      <button className="danger-action" onClick={onDelete}><Trash2 size={15} /> Excluir página</button>
      <div className="editor-actions-main"><button className="outline-action" onClick={onCancel}><X size={15} /> Cancelar</button><button className="primary-action" onClick={() => onSave(draft)}><Check size={15} /> Salvar página</button></div>
    </div>

    {editingResource && <ResourceEditorDialog resource={editingResource} onSave={saveResource} onDelete={() => deleteResource(editingResource.id)} onClose={() => setEditingResource(null)} />}
  </article>
}
