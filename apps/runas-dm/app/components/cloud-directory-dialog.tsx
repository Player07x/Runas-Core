"use client"

import { useState } from "react"
import { CloudDownload, X } from "lucide-react"
import { useEscapeToClose } from "../lib/use-escape-to-close"
import type { CollectionDirectoryEntry } from "../lib/collection-directory"

/**
 * Lista wikis ou bestiários que já existem no backup da nuvem deste mestre
 * mas ainda não neste dispositivo — o jeito de levar uma coleção para um
 * computador novo sem depender dela já ser a "ativa" localmente, já que o
 * registro de coleções é só deste navegador e nunca viaja sozinho.
 */
export function CloudDirectoryDialog({ title, introMessage, emptyMessage, entries, onClose, onImport }: {
  title: string
  introMessage: string
  emptyMessage: string
  entries: CollectionDirectoryEntry[]
  onClose: () => void
  onImport: (entry: CollectionDirectoryEntry) => void
}) {
  useEscapeToClose(onClose)
  const [importingId, setImportingId] = useState<string | null>(null)

  function choose(entry: CollectionDirectoryEntry) {
    if (importingId) return
    setImportingId(entry.id)
    onImport(entry)
  }

  return <div className="modal-backdrop backup-token-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="backup-token-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-directory-title">
      <header>
        <span className="backup-token-icon"><CloudDownload size={20} /></span>
        <div><p className="eyebrow">Backup remoto</p><h2 id="cloud-directory-title">{title}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
      </header>
      <div className="backup-token-body">
        {entries.length === 0
          ? <p>{emptyMessage}</p>
          : <>
              <p>{introMessage}</p>
              {entries.map((entry) => <div key={entry.id} className="local-vault-panel">
                <div><span><strong>{entry.name}</strong><small>Atualizado em {new Date(entry.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small></span></div>
                <div><button className="secondary-button" type="button" disabled={importingId !== null} onClick={() => choose(entry)}>{importingId === entry.id ? "Importando…" : "Importar"}</button></div>
              </div>)}
            </>}
      </div>
      <footer><button className="secondary-button" type="button" onClick={onClose}>Fechar</button></footer>
    </div>
  </div>
}
