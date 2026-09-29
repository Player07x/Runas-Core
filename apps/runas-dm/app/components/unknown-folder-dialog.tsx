"use client"

import { FolderPlus, LibraryBig, X } from "lucide-react"
import { useEscapeToClose } from "../lib/use-escape-to-close"
import type { WikiCollectionMeta } from "../lib/knowledge-model"

/**
 * A pasta escolhida está vazia e o nome dela não bate com nenhuma wiki já
 * conhecida neste dispositivo: perguntamos antes de decidir por conta
 * própria, em vez de silenciosamente criar uma wiki nova ou reaproveitar a
 * errada.
 */
export function UnknownFolderDialog({ folderName, knownWikis, onCreateNew, onReplaceExisting, onClose }: {
  folderName: string
  knownWikis: WikiCollectionMeta[]
  onCreateNew: () => void
  onReplaceExisting: (wikiId: string) => void
  onClose: () => void
}) {
  useEscapeToClose(onClose)
  return <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="obsidian-dialog" role="dialog" aria-modal="true" aria-labelledby="unknown-folder-title">
      <header><div><h2 id="unknown-folder-title">Pasta “{folderName}” está vazia</h2><p>O nome dela não bate com nenhuma wiki já conhecida neste dispositivo. O que ela deve ser?</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      <div className="obsidian-fields">
        <button className="secondary-button wide" onClick={onCreateNew}><FolderPlus size={16} /> Criar wiki nova chamada “{folderName}”</button>
        {knownWikis.length > 0 && <>
          <label className="obsidian-auto"><span><strong>Ou usar esta pasta para uma wiki que já existe</strong><small>O conteúdo dessa wiki é gravado aqui na próxima sincronização.</small></span></label>
          {knownWikis.map((wiki) => <button key={wiki.id} className="secondary-button wide" onClick={() => onReplaceExisting(wiki.id)}><LibraryBig size={16} /> {wiki.name}</button>)}
        </>}
      </div>
      <footer><span /><button className="secondary-button" onClick={onClose}>Cancelar</button></footer>
    </section>
  </div>
}
