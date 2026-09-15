"use client"

import { useRef } from "react"
import { KeyRound, X } from "lucide-react"
import { useEscapeToClose } from "../lib/use-escape-to-close"

export function BackupTokenDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (token: string) => void }) {
  const passwordRef = useRef<HTMLInputElement>(null)
  useEscapeToClose(onClose)

  return (
    <div className="modal-backdrop backup-token-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form
        className="backup-token-modal"
        method="post"
        action="/api/backup"
        onSubmit={(event) => {
          event.preventDefault()
          const token = passwordRef.current?.value.trim() ?? ""
          if (token) onSubmit(token)
        }}
      >
        <header>
          <span className="backup-token-icon"><KeyRound size={20} /></span>
          <div><p className="eyebrow">Backup privado</p><h2>Chave de acesso</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="backup-token-body">
          <p>Use a chave configurada no Cloudflare. Seu navegador pode oferecer salvá-la e preenchê-la automaticamente nas próximas sessões.</p>
          <input className="backup-token-username" name="username" value="runas-dm-backup" autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" />
          <label className="field">
            <span>Chave de acesso</span>
            <input ref={passwordRef} name="password" type="password" autoComplete="current-password" autoFocus required />
          </label>
          <small>O Runas DM guarda a chave somente durante esta sessão. Se você aceitar salvá-la, ela fica protegida pelo gerenciador de senhas do navegador.</small>
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">Continuar</button>
        </footer>
      </form>
    </div>
  )
}
