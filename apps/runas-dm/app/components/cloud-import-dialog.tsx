"use client"

import { Cloud, X } from "lucide-react"
import type { CloudImportMode } from "../lib/knowledge-model"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export function CloudImportDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (mode: CloudImportMode) => void }) {
  useEscapeToClose(onClose)

  function selectReplace() {
    if (window.confirm("Substituir tudo pelo backup da nuvem? Campanhas e páginas que só existem neste dispositivo serão apagadas.")) onSelect("replace")
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
          <p>O backup na nuvem só é aplicado quando você pedir. Escolha como usar o backup mais recente neste dispositivo.</p>
          <div className="local-vault-panel">
            <div><span><strong>Sincronizar</strong><small>Atualiza com o backup o que existe nos dois lados e cria o que só existe na nuvem; o que só existe neste dispositivo é preservado.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={() => onSelect("merge")}>Sincronizar</button></div>
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
