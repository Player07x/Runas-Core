"use client"

import { AlertTriangle, X } from "lucide-react"
import { describeCloudHead, type CloudHead } from "../lib/cloud-backup"
import { describeStats, type SnapshotStats } from "../lib/snapshot-policy"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export interface CloudConflict {
  reason: "stale" | "shrink"
  head: CloudHead | null
}

/**
 * A nuvem recusou o envio para não sobrescrever nada. Este diálogo explica o
 * que a nuvem já tem e deixa a decisão com o usuário: importar (mesclar) ou
 * substituir de propósito. Nada aqui apaga dados sem uma confirmação explícita,
 * e a versão que a nuvem já tinha continua guardada no histórico dela.
 */
export function CloudConflictDialog({ conflict, local, onImport, onForce, onClose }: { conflict: CloudConflict; local: SnapshotStats; onImport: () => void; onForce: () => void; onClose: () => void }) {
  useEscapeToClose(onClose)
  const remote = conflict.head ? describeCloudHead(conflict.head) : "conteúdo desconhecido"
  const shrink = conflict.reason === "shrink"

  function confirmForce() {
    if (window.confirm(shrink
      ? `Enviar mesmo assim? A nuvem tem ${describeStats(conflict.head?.stats)} e este envio levaria ${describeStats(local)}. A versão atual fica guardada no histórico da nuvem.`
      : "Substituir o backup da nuvem pelos dados deste dispositivo? A versão atual da nuvem fica guardada no histórico.")) onForce()
  }

  return (
    <div className="modal-backdrop backup-token-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="backup-token-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-conflict-title">
        <header>
          <span className="backup-token-icon"><AlertTriangle size={20} /></span>
          <div><p className="eyebrow">Backup remoto</p><h2 id="cloud-conflict-title">{shrink ? "Este envio apagaria dados da nuvem" : "A nuvem já tem um backup"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="backup-token-body">
          <p>{shrink
            ? "Este dispositivo tem bem menos dados do que a nuvem. Para não perder nada por engano, o envio foi pausado."
            : "A nuvem tem um backup que este dispositivo ainda não recebeu. Para não sobrescrevê-lo, o envio automático foi pausado."}</p>
          <p><strong>Na nuvem:</strong> {remote}<br /><strong>Neste dispositivo:</strong> {describeStats(local)}</p>
          <div className="local-vault-panel">
            <div><span><strong>Importar e mesclar</strong><small>Traz o que a nuvem tem e mantém o que só existe aqui. Depois disso o envio volta ao normal.</small></span></div>
            <div><button className="primary-button" type="button" onClick={onImport}>Importar e mesclar</button></div>
          </div>
          <div className="local-vault-panel">
            <div><span><strong>{shrink ? "Enviar mesmo assim" : "Substituir a nuvem por este dispositivo"}</strong><small>Grava o que há aqui por cima da nuvem. A versão atual da nuvem continua guardada no histórico e pode ser importada depois.</small></span></div>
            <div><button className="secondary-button" type="button" onClick={confirmForce}>{shrink ? "Enviar mesmo assim" : "Substituir a nuvem"}</button></div>
          </div>
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Decidir depois</button></footer>
      </div>
    </div>
  )
}
