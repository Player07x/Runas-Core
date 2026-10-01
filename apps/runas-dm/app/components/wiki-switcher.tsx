"use client"

import { useState } from "react"
import { Check, FolderOpen, LibraryBig, Pencil, Plus, Trash2, X } from "lucide-react"
import type { WikiCollectionMeta } from "../lib/knowledge-model"

/**
 * Lista as wikis deste dispositivo dentro do painel `⋯`, deixa trocar,
 * renomear, excluir, criar uma nova ou conectar uma pasta que ainda não
 * pertence a nenhuma. Trocar de wiki recarrega a página — é o jeito mais
 * simples e mais seguro de reiniciar toda a sincronização (vault, nuvem) sem
 * misturar estado de duas coleções no mesmo componente ainda montado.
 * Excluir tira só o registro do seletor: os dados (IndexedDB, vault, nuvem)
 * continuam intactos, como a Lixeira do sistema — nunca uma remoção definitiva.
 */
export function WikiSwitcher({ collections, activeId, onSwitch, onCreateNew, onConnectFolder, onRename, onDelete }: {
  collections: WikiCollectionMeta[]
  activeId: string
  onSwitch: (id: string) => void
  onCreateNew: () => void
  onConnectFolder: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const canDelete = collections.length > 1

  function startRename(collection: WikiCollectionMeta) { setRenamingId(collection.id); setRenameValue(collection.name) }
  function confirmRename() { if (renamingId) onRename(renamingId, renameValue); setRenamingId(null) }

  return <div className="topbar-menu-wiki-switcher" aria-label="Wikis deste dispositivo">
    <span className="topbar-menu-label">Wiki aberta</span>
    <div className="topbar-menu-wiki-list">
      {collections.map((collection) => renamingId === collection.id
        ? <form key={collection.id} className="wiki-switcher-rename" onSubmit={(event) => { event.preventDefault(); confirmRename() }}>
            <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label={`Renomear wiki ${collection.name}`} />
            <button type="submit" className="icon-button subtle" aria-label="Confirmar nome"><Check size={15} /></button>
            <button type="button" className="icon-button subtle" onClick={() => setRenamingId(null)} aria-label="Cancelar renomeação"><X size={15} /></button>
          </form>
        : <div key={collection.id} className="wiki-switcher-item-row">
            <button type="button" className={`topbar-menu-item wiki-switcher-item ${collection.id === activeId ? "active" : ""}`} onClick={() => { if (collection.id !== activeId) onSwitch(collection.id) }}>
              <LibraryBig size={16} />
              <span>{collection.name}</span>
              {collection.id === activeId && <Check size={15} />}
            </button>
            <button type="button" className="icon-button subtle" onClick={() => startRename(collection)} aria-label={`Renomear ${collection.name}`} title="Renomear"><Pencil size={14} /></button>
            <button type="button" className="icon-button subtle danger-icon" disabled={!canDelete} onClick={() => { if (window.confirm(`Remover a wiki “${collection.name}” do seletor?\n\nAs páginas e campanhas dela não são apagadas: continuam no IndexedDB deste navegador, no vault conectado e no backup na nuvem, só deixam de aparecer aqui.`)) onDelete(collection.id) }} aria-label={`Excluir ${collection.name}`} title={canDelete ? "Excluir do seletor" : "A última wiki não pode ser excluída"}><Trash2 size={14} /></button>
          </div>)}
    </div>
    <button type="button" className="topbar-menu-item" onClick={onCreateNew}><Plus size={18} /><span>Criar nova wiki</span></button>
    <button type="button" className="topbar-menu-item" onClick={onConnectFolder}><FolderOpen size={18} /><span>Conectar pasta existente…</span></button>
  </div>
}
