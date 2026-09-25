"use client"

import { useState } from "react"
import { Cloud, X } from "lucide-react"
import { describeCloudHead, type CloudHead } from "../lib/cloud-backup"
import type { CloudImportMode } from "../lib/knowledge-model"
import { useEscapeToClose } from "../lib/use-escape-to-close"

function versionLabel(head: CloudHead, index: number): string {
  const kind = index === 0 ? "Mais recente" : head.legacy ? "Backup antigo" : "Versão anterior"
  return `${kind} — ${describeCloudHead(head)}`
}

/** `versions` vem da nuvem, da mais nova para a mais antiga; sem lista, só o backup mais recente. */
export function CloudImportDialog({ versions = [], onClose, onSelect }: { versions?: CloudHead[]; onClose: () => void; onSelect: (mode: CloudImportMode, version?: number) => void }) {
  useEscapeToClose(onClose)
  const [selected, setSelected] = useState("")
  const version = selected === "" ? undefined : Number(selected)

  function selectReplace() {
    if (window.confirm("Substituir tudo pelo backup da nuvem? Campanhas e páginas que só existem neste dispositivo serão apagadas.")) onSelect("replace", version)
  }

  return (
    <div className="modal-backdrop backup-token-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="backup-token-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-import-title">
        <header>
          <span className="backup-token-icon"><Cloud size={20} /></span>
          <div><p className="eyebrow">Backup remoto</p><h2 id="cloud-import-title">Importar da nuvem</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="backup-token-body">
          <p>O backup na nuvem só é aplicado quando você pedir. Escolha como usar o backup neste dispositivo.</p>
          {versions.length > 1 && <label className="field"><span>Versão do backup</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{versions.map((head, index) => <option key={head.version} value={index === 0 ? "" : String(head.version)}>{versionLabel(head, index)}</option>)}</select></label>}
          <div className="local-vault-panel">
            <div><span><strong>Sincronizar</strong><small>Atualiza com o backup o que existe nos dois lados e cria o que só existe na nuvem; o que só existe neste dispositivo é preservado.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={() => onSelect("merge", version)}>Sincronizar</button></div>
          </div>
          <div className="local-vault-panel">
            <div><span><strong>Substituir tudo</strong><small>Descarta os dados deste dispositivo e adota o backup da nuvem por inteiro.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={selectReplace}>Substituir tudo</button></div>
          </div>
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button></footer>
      </div>
    </div>
  )
}
