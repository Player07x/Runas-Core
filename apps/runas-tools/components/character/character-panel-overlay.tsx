"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Dices, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CharacterTab } from "./character-sheet"
import { useRuleset } from "@/components/rulesets/ruleset-provider"
import { CharacterActions } from "./character-actions"

const CharacterSheet = dynamic(
  () => import("./character-sheet").then((module) => module.CharacterSheet),
  { ssr: false, loading: () => <p className="px-4 py-8 text-sm text-panel-muted">Carregando ficha…</p> },
)

const CronosCharacterSheet = dynamic(
  () => import("@/components/cronos/cronos-character-sheet").then((module) => module.CronosCharacterSheet),
  { ssr: false, loading: () => <p className="px-4 py-8 text-sm text-panel-muted">Carregando ficha de Cronos…</p> },
)

interface Props {
  isOpen: boolean
  close: () => void
  activeTab: CharacterTab
  setActiveTab: (tab: CharacterTab) => void
}

export function CharacterPanelOverlay({ isOpen, close, activeTab, setActiveTab }: Props) {
  const [panelWidth, setPanelWidth] = useState(800)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { activeRulesetId, activeRuleset } = useRuleset()

  useEffect(() => {
    if (!isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, close])

  return (
    <div className={cn("fixed inset-0 z-50", isOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!isOpen} inert={!isOpen}>
      <div
        onClick={close}
        className={cn(
          "absolute inset-0 bg-[#151923]/78 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ficha do Personagem"
        style={{ width: `min(${panelWidth}px, 92vw)` }}
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-none flex-col border-l border-panel-border bg-panel shadow-[0_0_70px_rgba(13,17,27,0.4)] transition-transform duration-300 ease-out motion-reduce:transition-none max-sm:!w-full",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex min-h-16 items-center justify-between gap-2 border-b border-panel-border/70 px-3 py-2.5 sm:min-h-20 sm:px-7 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel-elevated text-white shadow-lg sm:size-11 sm:rounded-2xl" aria-hidden="true"><Dices className="size-4.5 sm:size-5" /></span>
            <div className="min-w-0">
              <p className="hidden text-[0.65rem] font-bold uppercase tracking-[0.18em] text-panel-muted min-[360px]:block">{activeRuleset.name}</p>
              <h2 className="truncate text-base font-bold tracking-tight text-white sm:text-lg">Ficha do personagem</h2>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className={`flex size-9 items-center justify-center rounded-xl transition ${settingsOpen ? "bg-panel-input text-white" : "text-panel-muted hover:bg-panel-input hover:text-white"}`} aria-label="Configurações da ficha" title="Configurações da ficha"><Settings className="size-5" /></button>
            <button type="button" onClick={() => setPanelWidth((width) => Math.max(680, width - 120))} className="hidden size-9 items-center justify-center rounded-xl text-panel-muted transition hover:bg-panel-input hover:text-white sm:flex" aria-label="Diminuir painel" title="Diminuir painel"><PanelLeftOpen className="size-5" /></button>
            <button type="button" onClick={() => setPanelWidth((width) => Math.min(960, width + 120))} className="hidden size-9 items-center justify-center rounded-xl text-panel-muted transition hover:bg-panel-input hover:text-white sm:flex" aria-label="Ampliar painel" title="Ampliar painel"><PanelLeftClose className="size-5" /></button>
            <button type="button" onClick={close} className="flex size-9 items-center justify-center rounded-xl text-panel-muted transition-colors hover:bg-panel-input hover:text-white sm:size-10" aria-label="Fechar ficha"><X className="size-5.5" strokeWidth={2.25} /></button>
          </div>
        </div>
        {settingsOpen && (
          <div className="border-b border-panel-border bg-panel-elevated/70 px-3 py-3 sm:px-7" aria-label="Configurações da ficha">
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-panel-muted">Arquivo da ficha</p>
            <CharacterActions />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-7 sm:py-6">
          {isOpen && (activeRulesetId === "cronos"
            ? <CronosCharacterSheet activeTab={activeTab} onActiveTabChange={setActiveTab} />
            : <CharacterSheet activeTab={activeTab} onActiveTabChange={setActiveTab} />)}
        </div>
      </aside>
    </div>
  )
}
