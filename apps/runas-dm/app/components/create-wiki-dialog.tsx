"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export function CreateWikiDialog({ existingNames, onCreate, onClose }: {
  existingNames: string[]
  onCreate: (name: string) => void
  onClose: () => void
}) {
  useEscapeToClose(onClose)
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const duplicate = trimmed !== "" && existingNames.some((existing) => existing.localeCompare(trimmed, "pt-BR", { sensitivity: "base" }) === 0)

  function submit() {
    if (!trimmed) return
    onCreate(trimmed)
  }

  return <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="obsidian-dialog" role="dialog" aria-modal="true" aria-labelledby="create-wiki-title">
      <header><div><h2 id="create-wiki-title">Criar nova wiki</h2><p>Uma wiki nova tem suas próprias campanhas, páginas, tags e — se você conectar uma pasta — seu próprio vault do Obsidian.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      <div className="obsidian-fields">
        <label className="obsidian-auto">
          <span><strong>Nome da wiki</strong><small>Aparece no seletor de wikis deste dispositivo.</small></span>
        </label>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Sagas de Cronos" maxLength={80} onKeyDown={(event) => { if (event.key === "Enter") submit() }} />
        {duplicate && <p className="obsidian-message">Já existe uma wiki chamada “{trimmed}”. Você ainda pode criar outra com o mesmo nome, mas talvez prefira abrir a existente pelo seletor.</p>}
      </div>
      <footer><span /><button className="primary-button" disabled={!trimmed} onClick={submit}>Criar wiki</button></footer>
    </section>
  </div>
}
