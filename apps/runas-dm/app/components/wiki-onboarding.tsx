"use client"

import { LibraryBig, Plus } from "lucide-react"

/** Primeira vez do mestre no Runas DM: nenhuma wiki foi usada ainda (nem editada, nem conectada a um vault). */
export function WikiOnboarding({ onCreateNew }: { onCreateNew: () => void }) {
  return <div className="knowledge-empty wiki-onboarding">
    <LibraryBig size={32} />
    <strong>Bem-vindo ao Runas DM</strong>
    <p>Crie sua primeira wiki para guardar campanhas, personagens, mapas e histórias — compatível com o Obsidian a qualquer momento.</p>
    <button className="primary-button" onClick={onCreateNew}><Plus size={16} /> Criar nova wiki</button>
  </div>
}
