"use client"

import { useRef, useState } from "react"
import { Check, Plus, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react"
import { parseCharacterFile } from "@runas/core/lib/characterStorage"
import { createResource, parseResourceImport, resourceKindLabel, type BookEntry, type BookEntryKind, type BookResource, type BookResourceKind } from "../lib/book-model"
import { ResourceEditorDialog } from "./resource-panel"
import { RichTextEditor } from "./rich-text-editor"

interface Props {
  entry: BookEntry
  pageTitles: string[]
  onSave: (entry: BookEntry) => void
  onCancel: () => void
  onDelete: () => void
}

function tryParse<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

export function PageEditor({ entry, pageTitles, onSave, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<BookEntry>(() => ({ ...entry, resources: entry.resources.map((resource) => ({ ...resource })) }))
  const [editingResource, setEditingResource] = useState<BookResource | null>(null)
  const [importMessage, setImportMessage] = useState("")
  const importInputRef = useRef<HTMLInputElement>(null)

  function addResource(kind: BookResourceKind) {
    const resource = createResource(kind, "Novo registro")
    setDraft((current) => ({ ...current, resources: [...current.resources, resource] }))
    setEditingResource(resource)
  }

  async function importFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    let resourceCount = 0
    let characterName = ""
    let ignored = 0

    for (const file of files) {
      const text = await file.text()
      const resources = tryParse(() => parseResourceImport(text))
      if (resources) {
        setDraft((current) => ({ ...current, resources: [...current.resources, ...resources] }))
        resourceCount += resources.length
        continue
      }
      const character = tryParse(() => parseCharacterFile(text))
      if (character) {
        setDraft((current) => ({ ...current, kind: "character", entity: character }))
        characterName = character.name || "Ficha sem nome"
        continue
      }
      ignored += 1
    }

    const parts: string[] = []
    if (characterName) parts.push(`ficha "${characterName}" importada`)
    if (resourceCount > 0) parts.push(`${resourceCount} ${resourceCount === 1 ? "recurso importado" : "recursos importados"}`)
    if (ignored > 0) parts.push(`${ignored} ${ignored === 1 ? "arquivo ignorado" : "arquivos ignorados"} (formato não reconhecido)`)
    setImportMessage(parts.length > 0 ? parts.join(" · ") : "Nenhuma ficha ou recurso do Runas foi encontrado nos arquivos selecionados.")
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

    <RichTextEditor label="Conteúdo" className="page-content-editor" value={draft.content} onChange={(content) => setDraft({ ...draft, content })} wikiPageTitles={pageTitles} />

    <section className="resource-section editor-resources">
      <h2>Recursos anexados</h2>
      {draft.resources.length === 0 && <p className="page-copy-empty">Nenhum item, habilidade ou magia anexado ainda.</p>}
      <div className="resource-manage-list">{draft.resources.map((resource) => <button key={resource.id} className="resource-manage-row" onClick={() => setEditingResource(resource)}><span className={`entry-type type-${resource.kind}`}>{resourceKindLabel(resource.kind)}</span><span>{resource.entity.name}</span></button>)}</div>
      <div className="resource-add-row">
        <button className="outline-action" onClick={() => addResource("item")}><Plus size={15} /> Item</button>
        <button className="outline-action" onClick={() => addResource("ability")}><Sparkles size={15} /> Habilidade</button>
        <button className="outline-action" onClick={() => addResource("spell")}><Wand2 size={15} /> Magia</button>
        <button className="outline-action" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Importar arquivo</button>
      </div>
      <input ref={importInputRef} type="file" accept="application/json,.json" multiple hidden onChange={(event) => { void importFiles(event.target.files); event.currentTarget.value = "" }} />
      {importMessage && <p className="content-source import-message">{importMessage}</p>}
      <p className="content-source">Aceita uma ficha .json completa (Runas Tools/DM) ou um recurso exportado pelo Runas Book (item, habilidade ou magia).</p>
    </section>

    <div className="editor-actions page-editor-actions">
      <button className="danger-action" onClick={onDelete}><Trash2 size={15} /> Excluir página</button>
      <div className="editor-actions-main"><button className="outline-action" onClick={onCancel}><X size={15} /> Cancelar</button><button className="primary-action" onClick={() => onSave(draft)}><Check size={15} /> Salvar página</button></div>
    </div>

    {editingResource && <ResourceEditorDialog resource={editingResource} onSave={saveResource} onDelete={() => deleteResource(editingResource.id)} onClose={() => setEditingResource(null)} />}
  </article>
}
