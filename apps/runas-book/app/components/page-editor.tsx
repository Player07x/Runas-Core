"use client"

import { useRef, useState } from "react"
import { Check, ChevronDown, FileUser, Library, Plus, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react"
import { parseCharacterFile } from "@runas/core/lib/characterStorage"
import { createResource, resourceKindLabel, type BookChapter, type BookEntry, type BookEntryKind, type BookResource, type BookResourceKind } from "../lib/book-model"
import { parseAnyResourceImport } from "../lib/resource-import"
import { ResourceEditorDialog } from "./resource-panel"
import { RichTextEditor } from "./rich-text-editor"

interface Props {
  entry: BookEntry
  chapters: BookChapter[]
  pageTitles: string[]
  onSave: (entry: BookEntry) => void
  onCancel: () => void
  onDelete: () => void
}

interface PendingResourceImport {
  resources: BookResource[]
  selected: Set<string>
  errors: string[]
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function PageEditor({ entry, chapters, pageTitles, onSave, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<BookEntry>(() => ({ ...entry, resources: entry.resources.map((resource) => ({ ...resource })) }))
  const [editingResource, setEditingResource] = useState<BookResource | null>(null)
  const [importMessage, setImportMessage] = useState("")
  const [showImportMenu, setShowImportMenu] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingResourceImport | null>(null)
  const characterInputRef = useRef<HTMLInputElement>(null)
  const resourceInputRef = useRef<HTMLInputElement>(null)

  function addResource(kind: BookResourceKind) {
    const resource = createResource(kind, "Novo registro")
    setDraft((current) => ({ ...current, resources: [...current.resources, resource] }))
    setEditingResource(resource)
  }

  function chooseImport(input: HTMLInputElement | null) {
    setShowImportMenu(false)
    input?.click()
  }

  // Mesmo leitor da ficha do Runas Tools: JSON único, migrado e normalizado por `@runas/core`.
  async function importCharacter(file: File | undefined) {
    if (!file) return
    try {
      const character = parseCharacterFile(await file.text())
      setDraft((current) => ({ ...current, kind: "character", entity: character }))
      setImportMessage(`Ficha "${character.name || "Ficha sem nome"}" importada.`)
    } catch {
      setImportMessage("Não foi possível importar: arquivo de ficha inválido.")
    }
  }

  // Como no Runas Tools, os registros lidos passam por uma seleção antes de entrar na página.
  async function readResourceFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    const resources: BookResource[] = []
    const errors: string[] = []
    for (const file of files) {
      try {
        resources.push(...parseAnyResourceImport(await file.text()))
      } catch (error) {
        errors.push(`${file.name}: ${errorMessage(error, "arquivo não reconhecido.")}`)
      }
    }
    setImportMessage("")
    setPendingImport({ resources, selected: new Set(resources.map((resource) => resource.id)), errors })
  }

  function togglePendingResource(id: string) {
    setPendingImport((current) => {
      if (!current) return current
      const selected = new Set(current.selected)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { ...current, selected }
    })
  }

  function confirmResourceImport() {
    if (!pendingImport) return
    const chosen = pendingImport.resources.filter((resource) => pendingImport.selected.has(resource.id))
    if (chosen.length === 0) return
    setDraft((current) => ({ ...current, resources: [...current.resources, ...chosen] }))
    setImportMessage(`${chosen.length} ${chosen.length === 1 ? "recurso importado" : "recursos importados"}.`)
    setPendingImport(null)
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
        <label>Tópico<select className="form-input" value={draft.chapterId} onChange={(event) => setDraft({ ...draft, chapterId: event.target.value })}>{[...chapters].sort((left, right) => left.order - right.order).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
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
        <div className="import-menu-anchor">
          <button className="outline-action" aria-haspopup="menu" aria-expanded={showImportMenu} onClick={() => setShowImportMenu((open) => !open)}><Upload size={15} /> Importar <ChevronDown size={14} /></button>
          {showImportMenu && <>
            <button className="import-menu-backdrop" aria-label="Fechar opções de importação" onClick={() => setShowImportMenu(false)} />
            <div className="import-menu" role="menu">
              <button role="menuitem" onClick={() => chooseImport(characterInputRef.current)}><FileUser size={16} /><span><strong>Ficha</strong><small>JSON exportado pelo Runas Tools ou Runas DM</small></span></button>
              <button role="menuitem" onClick={() => chooseImport(resourceInputRef.current)}><Library size={16} /><span><strong>Habilidades, magias ou itens</strong><small>Listas exportadas pelo Runas Tools ou recursos do Runas Book</small></span></button>
            </div>
          </>}
        </div>
      </div>
      <input ref={characterInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importCharacter(event.target.files?.[0]); event.currentTarget.value = "" }} />
      <input ref={resourceInputRef} type="file" accept="application/json,.json" multiple hidden onChange={(event) => { void readResourceFiles(event.target.files); event.currentTarget.value = "" }} />
      {importMessage && <p className="content-source import-message">{importMessage}</p>}
    </section>

    <div className="editor-actions page-editor-actions">
      <button className="danger-action" onClick={onDelete}><Trash2 size={15} /> Excluir página</button>
      <div className="editor-actions-main"><button className="outline-action" onClick={onCancel}><X size={15} /> Cancelar</button><button className="primary-action" onClick={() => onSave(draft)}><Check size={15} /> Salvar página</button></div>
    </div>

    {pendingImport && <div className="modal-backdrop" onMouseDown={() => setPendingImport(null)}>
      <section className="modal-card editor-modal resource-import-modal" role="dialog" aria-modal="true" aria-labelledby="resource-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Importar</p><h2 id="resource-import-title">Escolha os registros</h2><p>{pendingImport.selected.size} de {pendingImport.resources.length} selecionados.</p></div><button className="icon-link" onClick={() => setPendingImport(null)} aria-label="Fechar importação"><X size={18} /></button></header>
        {pendingImport.errors.map((error) => <p key={error} className="import-error">{error}</p>)}
        {pendingImport.resources.length === 0
          ? <p className="page-copy-empty">Nenhum registro válido nos arquivos escolhidos.</p>
          : <div className="resource-import-list">{pendingImport.resources.map((resource) => <label key={resource.id} className="resource-import-row"><input type="checkbox" checked={pendingImport.selected.has(resource.id)} onChange={() => togglePendingResource(resource.id)} /><span className={`entry-type type-${resource.kind}`}>{resourceKindLabel(resource.kind)}</span><span>{resource.entity.name}</span></label>)}</div>}
        <div className="editor-actions"><button className="outline-action" onClick={() => setPendingImport(null)}>Cancelar</button><button className="primary-action" disabled={pendingImport.selected.size === 0} onClick={confirmResourceImport}><Upload size={15} /> Importar {pendingImport.selected.size || ""}</button></div>
      </section>
    </div>}

    {editingResource && <ResourceEditorDialog resource={editingResource} availableResources={draft.resources} onSave={saveResource} onDelete={() => deleteResource(editingResource.id)} onClose={() => setEditingResource(null)} />}
  </article>
}
