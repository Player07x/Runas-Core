"use client"

import { Check, FolderOpen, LibraryBig, Plus } from "lucide-react"
import type { WikiCollectionMeta } from "../lib/knowledge-model"

/**
 * Lista as wikis deste dispositivo dentro do painel `⋯`, deixa trocar,
 * criar uma nova ou conectar uma pasta que ainda não pertence a nenhuma.
 * Trocar de wiki recarrega a página — é o jeito mais simples e mais seguro
 * de reiniciar toda a sincronização (vault, nuvem) sem misturar estado de
 * duas coleções no mesmo componente ainda montado.
 */
export function WikiSwitcher({ collections, activeId, onSwitch, onCreateNew, onConnectFolder }: {
  collections: WikiCollectionMeta[]
  activeId: string
  onSwitch: (id: string) => void
  onCreateNew: () => void
  onConnectFolder: () => void
}) {
  return <div className="topbar-menu-wiki-switcher" aria-label="Wikis deste dispositivo">
    <span className="topbar-menu-label">Wiki aberta</span>
    <div className="topbar-menu-wiki-list">
      {collections.map((collection) => (
        <button key={collection.id} type="button" className={`topbar-menu-item wiki-switcher-item ${collection.id === activeId ? "active" : ""}`} onClick={() => { if (collection.id !== activeId) onSwitch(collection.id) }}>
          <LibraryBig size={16} />
          <span>{collection.name}</span>
          {collection.id === activeId && <Check size={15} />}
        </button>
      ))}
    </div>
    <button type="button" className="topbar-menu-item" onClick={onCreateNew}><Plus size={18} /><span>Criar nova wiki</span></button>
    <button type="button" className="topbar-menu-item" onClick={onConnectFolder}><FolderOpen size={18} /><span>Conectar pasta existente…</span></button>
  </div>
}
