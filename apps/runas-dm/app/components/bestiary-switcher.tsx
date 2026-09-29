"use client"

import { Archive, Check, Plus } from "lucide-react"
import { getRulesetDefinition } from "@runas/ruleset-contracts/definitions"
import type { BestiaryCollectionMeta } from "../lib/model"

/**
 * Lista os bestiários deste dispositivo dentro do painel `⋯`, com o sistema
 * de cada um, deixa trocar e criar um novo. Trocar de bestiário recarrega a
 * página — mesmo motivo do seletor de wikis: reiniciar tudo do zero é mais
 * simples e muito mais seguro do que trocar em memória.
 */
export function BestiarySwitcher({ collections, activeId, onSwitch, onCreateNew }: {
  collections: BestiaryCollectionMeta[]
  activeId: string
  onSwitch: (id: string) => void
  onCreateNew: () => void
}) {
  return <div className="topbar-menu-wiki-switcher" aria-label="Bestiários deste dispositivo">
    <span className="topbar-menu-label">Bestiário aberto</span>
    <div className="topbar-menu-wiki-list">
      {collections.map((collection) => (
        <button key={collection.id} type="button" className={`topbar-menu-item wiki-switcher-item ${collection.id === activeId ? "active" : ""}`} onClick={() => { if (collection.id !== activeId) onSwitch(collection.id) }}>
          <Archive size={16} />
          <span>{collection.name}<small>{getRulesetDefinition(collection.system).shortName}</small></span>
          {collection.id === activeId && <Check size={15} />}
        </button>
      ))}
    </div>
    <button type="button" className="topbar-menu-item" onClick={onCreateNew}><Plus size={18} /><span>Criar novo bestiário</span></button>
  </div>
}
