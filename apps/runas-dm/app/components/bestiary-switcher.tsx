"use client"

import { useState } from "react"
import { Archive, Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { getRulesetDefinition } from "@runas/ruleset-contracts/definitions"
import type { BestiaryCollectionMeta } from "../lib/model"

/**
 * Lista os bestiários deste dispositivo dentro do painel `⋯`, com o sistema
 * de cada um, deixa trocar, renomear, excluir e criar um novo. Trocar de
 * bestiário recarrega a página — mesmo motivo do seletor de wikis: reiniciar
 * tudo do zero é mais simples e muito mais seguro do que trocar em memória.
 * Excluir tira só o registro do seletor: os dados (IndexedDB, vault, nuvem)
 * continuam intactos, como a Lixeira do sistema — nunca uma remoção definitiva.
 */
export function BestiarySwitcher({ collections, activeId, onSwitch, onCreateNew, onRename, onDelete }: {
  collections: BestiaryCollectionMeta[]
  activeId: string
  onSwitch: (id: string) => void
  onCreateNew: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const canDelete = collections.length > 1

  function startRename(collection: BestiaryCollectionMeta) { setRenamingId(collection.id); setRenameValue(collection.name) }
  function confirmRename() { if (renamingId) onRename(renamingId, renameValue); setRenamingId(null) }

  return <div className="topbar-menu-wiki-switcher" aria-label="Bestiários deste dispositivo">
    <span className="topbar-menu-label">Bestiário aberto</span>
    <div className="topbar-menu-wiki-list">
      {collections.map((collection) => renamingId === collection.id
        ? <form key={collection.id} className="wiki-switcher-rename" onSubmit={(event) => { event.preventDefault(); confirmRename() }}>
            <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label={`Renomear bestiário ${collection.name}`} />
            <button type="submit" className="icon-button subtle" aria-label="Confirmar nome"><Check size={15} /></button>
            <button type="button" className="icon-button subtle" onClick={() => setRenamingId(null)} aria-label="Cancelar renomeação"><X size={15} /></button>
          </form>
        : <div key={collection.id} className="wiki-switcher-item-row">
            <button type="button" className={`topbar-menu-item wiki-switcher-item ${collection.id === activeId ? "active" : ""}`} onClick={() => { if (collection.id !== activeId) onSwitch(collection.id) }}>
              <Archive size={16} />
              <span>{collection.name}<small>{getRulesetDefinition(collection.system).shortName}</small></span>
              {collection.id === activeId && <Check size={15} />}
            </button>
            <button type="button" className="icon-button subtle" onClick={() => startRename(collection)} aria-label={`Renomear ${collection.name}`} title="Renomear"><Pencil size={14} /></button>
            <button type="button" className="icon-button subtle danger-icon" disabled={!canDelete} onClick={() => { if (window.confirm(`Remover o bestiário “${collection.name}” do seletor?\n\nAs fichas dele não são apagadas: continuam no IndexedDB deste navegador, no vault e no backup na nuvem, só deixam de aparecer aqui.`)) onDelete(collection.id) }} aria-label={`Excluir ${collection.name}`} title={canDelete ? "Excluir do seletor" : "O último bestiário não pode ser excluído"}><Trash2 size={14} /></button>
          </div>)}
    </div>
    <button type="button" className="topbar-menu-item" onClick={onCreateNew}><Plus size={18} /><span>Criar novo bestiário</span></button>
  </div>
}
