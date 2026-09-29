"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { RULESET_DEFINITIONS } from "@runas/ruleset-contracts/definitions"
import type { RulesetId } from "@runas/ruleset-contracts"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export function CreateBestiaryDialog({ existingNames, onCreate, onClose }: {
  existingNames: string[]
  onCreate: (input: { name: string; system: RulesetId }) => void
  onClose: () => void
}) {
  useEscapeToClose(onClose)
  const [name, setName] = useState("")
  const [system, setSystem] = useState<RulesetId>("runas-blue")
  const trimmed = name.trim()
  const duplicate = trimmed !== "" && existingNames.some((existing) => existing.localeCompare(trimmed, "pt-BR", { sensitivity: "base" }) === 0)
  const chosenRuleset = RULESET_DEFINITIONS.find((ruleset) => ruleset.id === system)

  function submit() {
    if (!trimmed) return
    onCreate({ name: trimmed, system })
  }

  return <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="obsidian-dialog" role="dialog" aria-modal="true" aria-labelledby="create-bestiary-title">
      <header><div><h2 id="create-bestiary-title">Criar novo bestiário</h2><p>O sistema é fixado na criação: cada bestiário guarda fichas de um único sistema de regras.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      <div className="obsidian-fields">
        <label className="obsidian-auto"><span><strong>Nome do bestiário</strong><small>Aparece no seletor de bestiários deste dispositivo.</small></span></label>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Monstros de Sagas de Cronos" maxLength={80} onKeyDown={(event) => { if (event.key === "Enter") submit() }} />
        <label>
          <span>Sistema</span>
          <select value={system} onChange={(event) => setSystem(event.target.value as RulesetId)}>
            {RULESET_DEFINITIONS.map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.name}</option>)}
          </select>
        </label>
        {chosenRuleset && <p className="obsidian-message wide">{chosenRuleset.description}{chosenRuleset.id === "cronos" && " O editor de fichas de Sagas de Cronos dentro do Runas DM chega em uma atualização futura; o bestiário já pode ser criado e guardado desde já."}</p>}
        {duplicate && <p className="obsidian-message">Já existe um bestiário chamado “{trimmed}”. Você ainda pode criar outro com o mesmo nome, mas talvez prefira abrir o existente pelo seletor.</p>}
      </div>
      <footer><span /><button className="primary-button" disabled={!trimmed} onClick={submit}>Criar bestiário</button></footer>
    </section>
  </div>
}
