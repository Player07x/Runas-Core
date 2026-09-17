"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"

export type TopbarStatusTone = "idle" | "busy" | "good" | "bad"

export interface TopbarStatus {
  tone: TopbarStatusTone
  label: string
}

/**
 * A barra superior carrega somente marca, navegação e este botão. Todo o
 * resto (tema, backup, importação, Obsidian) vive no painel, que mantém a
 * linha curta e igual em todas as áreas. O estado de salvamento é a única
 * informação que continua visível fora do painel, reduzida a um ponto
 * colorido: num aplicativo local-first, saber que a alteração foi gravada
 * não pode depender de abrir um menu.
 */
export function TopbarMenu({ status, label = "Ações", children }: { status: TopbarStatus; label?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return <div className="topbar-menu" ref={containerRef}>
    <button
      className={`topbar-menu-trigger ${open ? "open" : ""}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`${label} · ${status.label}`}
      title={`${label} · ${status.label}`}
      onClick={() => setOpen((current) => !current)}
    >
      <span className={`topbar-status-dot ${status.tone}`} aria-hidden="true" />
      <MoreHorizontal size={18} />
    </button>
    {open && <div className="topbar-menu-panel" role="menu">
      <p className="topbar-menu-status"><span className={`topbar-status-dot ${status.tone}`} aria-hidden="true" />{status.label}</p>
      {children(() => setOpen(false))}
    </div>}
  </div>
}
